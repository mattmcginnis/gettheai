import { addDays } from "date-fns";
import {
  ListingStatus as PrismaListingStatus,
  OfferStatus as PrismaOfferStatus,
  Prisma,
  SupportStatus as PrismaSupportStatus,
  TransactionStatus as PrismaTransactionStatus
} from "@prisma/client";
import { appraiseDomain, getTld, isValidDomain, normalizeDomain } from "@/lib/appraisal";
import { COMMISSION_RATE } from "@/lib/constants";
import { EscrowApiError, createEscrowHandoff, fetchEscrowTransaction } from "@/lib/escrow";
import { parsePortfolioCsv } from "@/lib/imports";
import { scanListingRisk } from "@/lib/moderation";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { searchPostgresListingIds } from "@/lib/postgres-search";
import { adminQueue, listings as seedListings } from "@/lib/seed";
import { canQuerySearchIndex, searchIndexedListingIds } from "@/lib/search-index";
import { filterAndSortListings, getListing as getSeedListing } from "@/lib/search";
import { calculateCommission, canPlaceOffer } from "@/lib/transactions";
import type {
  AdminQueueItem,
  Appraisal,
  DomainFilters,
  DomainListing,
  ListingType,
  Offer,
  SearchAlertItem,
  SupportCaseItem,
  Transaction,
  TransactionStatus,
  VerificationTier,
  WatchlistItem
} from "@/lib/types";
import { runGuardedAiDraft } from "@/lib/ai";

const domainListingInclude = {
  seller: {
    include: {
      sellerProfile: true
    }
  },
  appraisal: true
} satisfies Prisma.DomainListingInclude;

const offerIncludeConfig = {
  buyer: true,
  listing: {
    include: domainListingInclude
  }
} satisfies Prisma.OfferInclude;

const transactionIncludeConfig = {
  buyer: true,
  listing: {
    include: domainListingInclude
  },
  offer: true
} satisfies Prisma.TransactionInclude;

type PrismaListing = Prisma.DomainListingGetPayload<{ include: typeof domainListingInclude }>;
type PrismaOffer = Prisma.OfferGetPayload<{ include: typeof offerIncludeConfig }>;
type PrismaTransaction = Prisma.TransactionGetPayload<{ include: typeof transactionIncludeConfig }>;
type LocalDraftListing = DomainListing & {
  ownershipVerification?: {
    method: "dns_txt" | "nameserver" | "registrar" | "manual";
    record: string;
    value: string;
    verifiedAt?: string;
    verifiedBy?: string;
  };
};
export interface AdminEntityDetail {
  entity: string;
  id: string;
  title: string;
  subtitle: string;
  primaryHref?: string;
  sections: Array<{
    title: string;
    rows: Array<{
      label: string;
      value: string;
      preformatted?: boolean;
    }>;
  }>;
}
export interface AdminOperationFilters {
  q?: string;
  kind?: "all" | "users" | "listings" | "offers" | "transactions" | "audit";
  status?: string;
}

const localDraftListings = ((globalThis as typeof globalThis & {
  __gettheLocalDraftListings?: LocalDraftListing[];
}).__gettheLocalDraftListings ??= []);

export async function listMarketplaceListings(filters: DomainFilters = {}) {
  if (!isDatabaseConfigured()) {
    return filterAndSortListings([...seedListings, ...localDraftListings], filters);
  }

  const prisma = getPrisma();
  if (canQuerySearchIndex()) {
    const indexedIds = await searchIndexedListingIds(filters).catch(() => null);
    if (indexedIds) {
      if (!indexedIds.length) {
        return [];
      }

      const rows = await prisma.domainListing.findMany({
        where: {
          id: {
            in: indexedIds
          }
        },
        include: listingInclude()
      });
      const mapped = rows.map(mapListing);
      const position = new Map(indexedIds.map((id, index) => [id, index]));
      return mapped.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
    }
  }

  return hydrateListingsInOrder(await searchPostgresListingIds(prisma, filters));
}

async function hydrateListingsInOrder(ids: string[]) {
  if (!ids.length) {
    return [];
  }

  const rows = await getPrisma().domainListing.findMany({
    where: {
      id: {
        in: ids
      }
    },
    include: listingInclude()
  });
  const mapped = rows.map(mapListing);
  const position = new Map(ids.map((id, index) => [id, index]));
  return mapped.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
}

export async function listAllMarketplaceListingsForIndexing() {
  if (!isDatabaseConfigured()) {
    return filterAndSortListings([...seedListings, ...localDraftListings]);
  }

  const prisma = getPrisma();
  const rows = await prisma.domainListing.findMany({
    where: { status: "ACTIVE" },
    include: listingInclude(),
    orderBy: { updatedAt: "desc" }
  });

  return rows.map(mapListing);
}

export async function getMarketplaceListing(identifier: string) {
  if (!isDatabaseConfigured()) {
    const normalizedIdentifier = identifier.toLowerCase();
    const localDraft = localDraftListings.find(
      (listing) => listing.id === identifier || listing.domain === normalizedIdentifier
    );

    return localDraft ?? getSeedListing(identifier) ?? seedListings.find((listing) => listing.id === identifier) ?? null;
  }

  const row = await getPrismaListingByIdOrDomain(identifier);
  return row ? mapListing(row) : null;
}

export async function getFeaturedListings(limit = 3) {
  const active = await listMarketplaceListings({ sort: "featured" });
  return active.slice(0, limit);
}

export async function createListingDraft(input: {
  domain: string;
  price: number;
  minimumOffer?: number;
  registrar?: string;
  category: string;
  sellerEmail?: string;
}) {
  const domain = normalizeDomain(input.domain);
  if (!isValidDomain(domain)) {
    throw new Error("Invalid domain.");
  }

  const appraisal = appraiseDomain(domain);
  const ownershipVerification = {
    method: "dns_txt" as const,
    record: `_getthe-verify.${domain}`,
    value: `getthe=${cryptoSafeId()}`
  };

  if (!isDatabaseConfigured()) {
    const draft: LocalDraftListing = {
      id: `draft_${Date.now()}`,
      domain,
      tld: getTld(domain),
      status: "pending_verification",
      price: input.price,
      minimumOffer: input.minimumOffer ?? Math.round(input.price * 0.65),
      registrar: input.registrar ?? "Unknown",
      seller: {
        id: "seller-local",
        publicName: "GetThe Seller",
        slug: "getthe-seller",
        verified: true,
        transactionCount: 0,
        avgResponseHours: 6
      },
      listingType: "buy_now_and_offer",
      commissionRate: COMMISSION_RATE,
      ownershipVerified: false,
      description: appraisal.generatedSummary,
      category: input.category,
      trafficMonthly: 0,
      domainAgeYears: 0,
      seoTitle: `${domain} is for sale`,
      seoDescription: `Buy ${domain} through GetThe with Escrow.com transaction handoff.`,
      brandSignals: appraisal.keywordSignals,
      createdAt: new Date().toISOString(),
      ownershipVerification,
      appraisal
    };

    localDraftListings.unshift(draft);
    return draft;
  }

  const prisma = getPrisma();
  const seller = await ensureUser(input.sellerEmail ?? "seller@getthe.com", "SELLER");
  const row = await prisma.domainListing.create({
    data: {
      sellerId: seller.id,
      domain,
      tld: getTld(domain),
      registrar: input.registrar,
      status: "PENDING_VERIFICATION",
      listingType: "BUY_NOW_AND_OFFER",
      priceCents: dollarsToCents(input.price),
      minimumOfferCents: dollarsToCents(input.minimumOffer ?? Math.round(input.price * 0.65)),
      commissionBps: 700,
      ownershipVerification,
      description: appraisal.generatedSummary,
      category: input.category,
      trafficMonthly: 0,
      domainAgeYears: 0,
      seoTitle: `${domain} is for sale`,
      seoDescription: `Buy ${domain} through GetThe with Escrow.com transaction handoff.`,
      landingPageSlug: domain.replaceAll(".", "-"),
      brandSignals: appraisal.keywordSignals as Prisma.InputJsonValue,
      appraisal: {
        create: mapAppraisalToCreate(appraisal)
      }
    },
    include: listingInclude()
  });

  return mapListing(row as PrismaListing);
}

export async function verifyListingOwnership(input: {
  listingId: string;
  method: "dns_txt" | "nameserver" | "registrar" | "manual";
  token?: string;
  actorEmail?: string;
}) {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (!isDatabaseConfigured()) {
    const localDraft = localDraftListings.find((item) => item.id === input.listingId || item.domain === input.listingId);
    const verifiedAt = new Date().toISOString();

    if (localDraft) {
      localDraft.status = "active";
      localDraft.ownershipVerified = true;
      localDraft.ownershipVerification = {
        ...(localDraft.ownershipVerification ?? {
          method: input.method,
          record: `_getthe-verify.${localDraft.domain}`,
          value: input.token ?? "manual-review"
        }),
        method: input.method,
        verifiedAt,
        verifiedBy: input.actorEmail ?? "system"
      };
    }

    return {
      listing: {
        ...(localDraft ?? listing),
        status: "active",
        ownershipVerified: true
      },
      verification: {
        method: input.method,
        verifiedAt,
        mode: "local"
      }
    };
  }

  const prisma = getPrisma();
  const row = await getPrismaListingByIdOrDomain(input.listingId);
  if (!row) {
    throw new Error("Listing not found.");
  }

  const existingVerification = row.ownershipVerification as { value?: string };
  if (input.method !== "manual" && existingVerification.value && input.token !== existingVerification.value) {
    throw new Error("Ownership verification token does not match.");
  }

  const verifiedAt = new Date().toISOString();
  const updated = await prisma.domainListing.update({
    where: { id: row.id },
    data: {
      status: "ACTIVE",
      ownershipVerification: {
        ...existingVerification,
        method: input.method,
        verifiedAt,
        verifiedBy: input.actorEmail ?? "system"
      } as Prisma.InputJsonValue
    },
    include: listingInclude()
  });

  await prisma.auditEvent.create({
    data: {
      eventType: "listing.ownership.verified",
      entityType: "domain_listing",
      entityId: row.id,
      metadata: {
        method: input.method,
        verifiedAt
      }
    }
  });

  return {
    listing: mapListing(updated),
    verification: {
      method: input.method,
      verifiedAt,
      mode: "database"
    }
  };
}

export async function createOfferRecord(input: {
  listingId: string;
  buyerEmail: string;
  amount: number;
  buyerVerificationTier: VerificationTier;
}) {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (input.amount < listing.minimumOffer) {
    throw new Error(`Minimum offer is ${listing.minimumOffer}.`);
  }

  const verification = canPlaceOffer(input.amount, input.buyerVerificationTier);
  if (!verification.allowed) {
    const error = new Error(`Upgrade buyer verification to ${verification.required} before placing this offer.`);
    Object.assign(error, { requiredVerificationTier: verification.required, statusCode: 403 });
    throw error;
  }

  const offer: Offer = {
    id: `offer_${Date.now()}`,
    listingId: listing.id,
    buyerEmail: input.buyerEmail,
    amount: input.amount,
    status: "pending",
    buyerVerificationTier: input.buyerVerificationTier,
    expiresAt: addDays(new Date(), 7).toISOString(),
    negotiationHistory: [
      {
        actor: "buyer",
        message: "Initial verified buyer offer.",
        amount: input.amount,
        at: new Date().toISOString()
      },
      {
        actor: "ai_copilot",
        message: "Seller can counter within their configured minimum and target range.",
        at: new Date().toISOString()
      }
    ]
  };

  if (!isDatabaseConfigured()) {
    return offer;
  }

  const prisma = getPrisma();
  const buyer = await ensureUser(input.buyerEmail, "BUYER", input.buyerVerificationTier);
  const row = await prisma.offer.create({
    data: {
      listingId: listing.id,
      buyerId: buyer.id,
      amountCents: dollarsToCents(input.amount),
      status: "PENDING",
      buyerVerificationTier: mapVerificationToPrisma(input.buyerVerificationTier),
      expiresAt: new Date(offer.expiresAt),
      negotiationHistory: offer.negotiationHistory
    },
    include: offerInclude()
  });

  return mapOffer(row);
}

export async function decideOffer(input: {
  offerId: string;
  action: "accept" | "reject" | "counter";
  amount?: number;
  note: string;
}) {
  if (!isDatabaseConfigured()) {
    return {
      offerId: input.offerId,
      status: input.action === "accept" ? "accepted" : input.action === "reject" ? "rejected" : "countered",
      note: input.note,
      amount: input.amount,
      transaction: input.action === "accept" ? await createTransactionRecord({ listingId: "dom-1", buyerEmail: "buyer@example.com", amount: input.amount }) : null
    };
  }

  const prisma = getPrisma();
  const existing = await getPrismaOfferById(input.offerId);
  if (!existing) {
    throw new Error("Offer not found.");
  }

  const history = Array.isArray(existing.negotiationHistory) ? existing.negotiationHistory : [];
  const nextStatus = input.action === "accept" ? "ACCEPTED" : input.action === "reject" ? "REJECTED" : "COUNTERED";
  const updated = await prisma.offer.update({
    where: { id: input.offerId },
    data: {
      status: nextStatus,
      amountCents: input.amount ? dollarsToCents(input.amount) : existing.amountCents,
      negotiationHistory: [
        ...history,
        {
          actor: "seller",
          message: input.note,
          amount: input.amount,
          at: new Date().toISOString()
        }
      ]
    },
    include: offerInclude()
  });

  return {
    offer: mapOffer(updated),
    transaction:
      input.action === "accept"
        ? await createTransactionRecord({
            listingId: updated.listingId,
            buyerEmail: updated.buyer.email,
            offerId: updated.id,
            amount: centsToDollars(updated.amountCents)
          })
        : null
  };
}

export async function createTransactionRecord(input: {
  listingId: string;
  buyerEmail: string;
  offerId?: string;
  amount?: number;
}) {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  const amount = input.amount ?? listing.price;
  const commission = calculateCommission(amount);
  const sellerEmail = `${listing.seller.slug}@seller.getthe.com`;
  const handoff = await createEscrowHandoff({
    listing,
    buyerEmail: input.buyerEmail,
    sellerEmail,
    amount
  }).catch(async (error) => {
    if (isDatabaseConfigured()) {
      const metadata: Record<string, unknown> = {
        listingId: listing.id,
        buyerEmail: input.buyerEmail,
        amount,
        message: error instanceof Error ? error.message : "Escrow.com handoff failed."
      };

      if (error instanceof EscrowApiError) {
        metadata.status = error.status;
        metadata.details = error.details;
      }

      await getPrisma().auditEvent.create({
        data: {
          eventType: "escrow.handoff.failed",
          entityType: "domain_listing",
          entityId: listing.id,
          metadata: metadata as Prisma.InputJsonValue
        }
      });
    }

    throw error;
  });
  const now = new Date().toISOString();
  const transaction: Transaction = {
    id: `txn_${Date.now()}`,
    listingId: listing.id,
    offerId: input.offerId,
    buyerEmail: input.buyerEmail,
    sellerId: listing.seller.id,
    escrowProvider: "escrow.com",
    escrowId: handoff.escrowId,
    escrowUrl: handoff.escrowUrl,
    amount,
    commission,
    status: "escrow_started",
    statusTimeline: [
      { status: "initiated", label: "GetThe created the transaction record.", at: now },
      {
        status: "escrow_started",
        label: handoff.mode === "api" ? "Escrow.com API transaction created." : "Buyer is handed off to Escrow.com.",
        at: now
      }
    ],
    transferChecklist: [
      { label: "Buyer funds Escrow.com transaction", done: false },
      { label: "Seller unlocks domain and obtains transfer code", done: false },
      { label: "Buyer confirms registrar transfer", done: false },
      { label: "GetThe records transfer verification", done: false },
      { label: "Escrow.com releases seller payout", done: false }
    ]
  };

  if (!isDatabaseConfigured()) {
    return transaction;
  }

  const prisma = getPrisma();
  const buyer = await ensureUser(input.buyerEmail, "BUYER");
  const row = await prisma.transaction.create({
    data: {
      listingId: listing.id,
      offerId: input.offerId,
      buyerId: buyer.id,
      sellerId: listing.seller.id,
      escrowProvider: "escrow.com",
      escrowId: handoff.escrowId,
      escrowUrl: handoff.escrowUrl,
      amountCents: dollarsToCents(amount),
      commissionCents: dollarsToCents(commission),
      status: "ESCROW_STARTED",
      statusTimeline: transaction.statusTimeline,
      transferChecklist: transaction.transferChecklist,
      payoutState: "pending"
    },
    include: transactionInclude()
  });

  return mapTransaction(row);
}

export async function updateTransactionFromEscrowEvent(event: {
  id?: string;
  transaction_id?: string;
  status?: string;
  [key: string]: unknown;
}) {
  const escrowId = String(event.transaction_id ?? event.id ?? "unknown");
  const mappedStatus = mapEscrowStatus(event.status);
  const timelineEntry = {
    status: mappedStatus,
    label: `Escrow.com reported ${event.status ?? "status update"}.`,
    at: new Date().toISOString()
  };
  const auditEvent = {
    eventType: "escrow.webhook.received",
    entityType: "transaction",
    entityId: escrowId,
    metadata: event
  };

  if (!isDatabaseConfigured()) {
    return {
      received: true,
      mappedStatus,
      auditEvent,
      updated: false,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const existing = await prisma.transaction.findFirst({
    where: {
      OR: [{ id: escrowId }, { escrowId }]
    }
  });

  await prisma.auditEvent.create({
    data: {
      ...auditEvent,
      metadata: auditEvent.metadata as Prisma.InputJsonValue
    }
  });

  if (!existing) {
    return {
      received: true,
      mappedStatus,
      auditEvent,
      updated: false,
      mode: "database"
    };
  }

  const currentTimeline = Array.isArray(existing.statusTimeline) ? existing.statusTimeline : [];
  const updated = await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      status: mappedStatus.toUpperCase() as PrismaTransactionStatus,
      statusTimeline: [...currentTimeline, timelineEntry] as unknown as Prisma.InputJsonValue,
      payoutState: mappedStatus === "payout_complete" ? "complete" : existing.payoutState
    },
    include: transactionInclude()
  });

  return {
    received: true,
    mappedStatus,
    auditEvent,
    updated: true,
    transaction: mapTransaction(updated)
  };
}

export async function syncTransactionEscrowStatus(input: { transactionId: string; actorEmail?: string }) {
  if (!isDatabaseConfigured()) {
    return {
      synced: false,
      mode: "local",
      reason: "DATABASE_URL is not configured."
    };
  }

  const prisma = getPrisma();
  const transaction = await prisma.transaction.findFirst({
    where: {
      OR: [{ id: input.transactionId }, { escrowId: input.transactionId }]
    }
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  const providerPayload = await fetchEscrowTransaction(transaction.escrowId ?? transaction.id);
  const result = await updateTransactionFromEscrowEvent({
    ...(providerPayload as Record<string, unknown>),
    id: transaction.escrowId ?? transaction.id,
    transaction_id: transaction.escrowId ?? transaction.id
  });
  const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;

  await prisma.auditEvent.create({
    data: {
      actorId: actor?.id,
      eventType: "escrow.status.synced",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        transactionId: transaction.id,
        escrowId: transaction.escrowId,
        providerPayload
      } as Prisma.InputJsonValue
    }
  });

  return {
    synced: true,
    result
  };
}

export async function getTransactionDetail(identifier: string) {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const row = await getPrisma().transaction.findFirst({
    where: {
      OR: [{ id: identifier }, { escrowId: identifier }]
    },
    include: transactionInclude()
  });

  if (!row) {
    return null;
  }

  return {
    transaction: mapTransaction(row),
    listing: mapListing(row.listing),
    buyer: {
      id: row.buyer.id,
      email: row.buyer.email,
      verificationTier: mapVerificationFromPrisma(row.buyer.verificationTier),
      twoFactorEnabled: row.buyer.twoFactorEnabled
    },
    offer: row.offer ? mapOffer({ ...row.offer, buyer: row.buyer, listing: row.listing }) : null,
    payoutState: row.payoutState,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function processPortfolioImport(csv: string) {
  const rows = parsePortfolioCsv(csv);
  const accepted = rows.filter((row) => row.domain && isValidDomain(row.domain) && (row.price ?? 0) >= 500);
  const needsReview = rows.filter((row) => !accepted.includes(row));

  if (isDatabaseConfigured()) {
    for (const row of accepted) {
      await createListingDraft({
        domain: row.domain,
        price: row.price ?? 500,
        minimumOffer: row.minimumOffer,
        registrar: row.registrar,
        category: row.category ?? "Imported"
      });
    }
  }

  return {
    summary: {
      total: rows.length,
      accepted: accepted.length,
      needsReview: needsReview.length
    },
    accepted: accepted.map((row) => ({
      ...row,
      status: "pending_verification",
      ownershipVerification: "dns_txt"
    })),
    review: needsReview.map((row) => ({
      ...row,
      reason: !row.domain || !isValidDomain(row.domain) ? "invalid_domain" : "below_mid_tier_floor_or_missing_price"
    }))
  };
}

export async function createWatchlistItem(input: {
  userEmail: string;
  listingId: string;
}): Promise<WatchlistItem> {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  const createdAt = new Date().toISOString();
  if (!isDatabaseConfigured()) {
    return {
      id: `watch_${Date.now()}`,
      userEmail: input.userEmail,
      listingId: listing.id,
      domain: listing.domain,
      createdAt
    };
  }

  const user = await ensureUser(input.userEmail, "BUYER");
  const row = await getPrisma().watchlist.upsert({
    where: {
      userId_listingId: {
        userId: user.id,
        listingId: listing.id
      }
    },
    update: {},
    create: {
      userId: user.id,
      listingId: listing.id
    },
    include: {
      user: true,
      listing: true
    }
  });

  return {
    id: row.id,
    userEmail: row.user.email,
    listingId: row.listingId,
    domain: row.listing.domain,
    createdAt: row.createdAt.toISOString()
  };
}

export async function createSearchAlert(input: {
  userEmail: string;
  name: string;
  filters: DomainFilters;
  cadence: SearchAlertItem["cadence"];
}): Promise<SearchAlertItem> {
  const createdAt = new Date().toISOString();
  if (!isDatabaseConfigured()) {
    return {
      id: `alert_${Date.now()}`,
      userEmail: input.userEmail,
      name: input.name,
      filters: input.filters,
      cadence: input.cadence,
      active: true,
      createdAt
    };
  }

  const user = await ensureUser(input.userEmail, "BUYER");
  const row = await getPrisma().searchAlert.create({
    data: {
      userId: user.id,
      name: input.name,
      filters: input.filters as Prisma.InputJsonValue,
      cadence: input.cadence,
      active: true
    },
    include: {
      user: true
    }
  });

  return {
    id: row.id,
    userEmail: row.user.email,
    name: row.name,
    filters: row.filters as DomainFilters,
    cadence: row.cadence as SearchAlertItem["cadence"],
    active: row.active,
    createdAt: row.createdAt.toISOString()
  };
}

export async function createSupportCase(input: {
  requesterEmail: string;
  subject: string;
  transactionId?: string;
  context: string;
}): Promise<SupportCaseItem> {
  const draft = await runGuardedAiDraft({
    kind: "support",
    subject: input.subject,
    context: input.context
  });
  const createdAt = new Date().toISOString();

  if (!isDatabaseConfigured()) {
    return {
      id: `case_${Date.now()}`,
      requesterEmail: input.requesterEmail,
      subject: input.subject,
      status: "open",
      transactionId: input.transactionId,
      aiDraftResponses: [draft],
      createdAt
    };
  }

  const user = await ensureUser(input.requesterEmail, "BUYER");
  const row = await getPrisma().supportCase.create({
    data: {
      requesterId: user.id,
      subject: input.subject,
      transactionId: input.transactionId,
      status: "OPEN",
      aiDraftResponses: [draft] as unknown as Prisma.InputJsonValue
    },
    include: {
      requester: true
    }
  });

  return mapSupportCase(row);
}

export async function listSupportCases() {
  if (!isDatabaseConfigured()) {
    return [] satisfies SupportCaseItem[];
  }

  const rows = await getPrisma().supportCase.findMany({
    include: { requester: true },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return rows.map(mapSupportCase);
}

export async function listNotificationEvents(input: { recipientEmail?: string; limit?: number } = {}) {
  if (!isDatabaseConfigured()) {
    return [] as Array<{
      id: string;
      eventType: string;
      tag?: string;
      subject?: string;
      recipientEmail?: string;
      entityType: string;
      entityId: string;
      createdAt: string;
    }>;
  }

  const rows = await getPrisma().auditEvent.findMany({
    where: {
      eventType: {
        startsWith: "notification."
      }
    },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 8
  });

  return rows
    .map((row) => {
      const metadata = row.metadata as {
        to?: unknown;
        tag?: unknown;
        subject?: unknown;
        recipientRole?: unknown;
      };
      return {
        id: row.id,
        eventType: row.eventType,
        tag: typeof metadata.tag === "string" ? metadata.tag : undefined,
        subject: typeof metadata.subject === "string" ? metadata.subject : undefined,
        recipientEmail: typeof metadata.to === "string" ? metadata.to : undefined,
        recipientRole: typeof metadata.recipientRole === "string" ? metadata.recipientRole : undefined,
        entityType: row.entityType,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString()
      };
    })
    .filter((row) => !input.recipientEmail || row.recipientEmail === input.recipientEmail);
}

export async function getAdminOverview(filters: AdminOperationFilters = {}) {
  const activeListings = await listMarketplaceListings();
  const supportCases = await listSupportCases();
  const operations = await getAdminOperations(filters);
  const gmv = activeListings.reduce((sum, listing) => sum + listing.price, 0);
  const commission = Math.round(gmv * COMMISSION_RATE);

  return {
    activeListings,
    gmv,
    commission,
    queue: adminQueue,
    supportCases,
    operations
  };
}

export async function getAdminOperations(filters: AdminOperationFilters = {}) {
  if (!isDatabaseConfigured()) {
    return applyAdminOperationFilters({
      users: [],
      listings: seedListings.slice(0, 8).map((listing) => ({
        id: listing.id,
        domain: listing.domain,
        status: listing.status,
        seller: listing.seller.publicName,
        price: listing.price,
        updatedAt: listing.createdAt
      })),
      offers: [],
      transactions: [],
      auditEvents: []
    }, filters);
  }

  const prisma = getPrisma();
  const [users, listings, offers, transactions, auditEvents] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.domainListing.findMany({ include: listingInclude(), orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.offer.findMany({ include: offerInclude(), orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.transaction.findMany({ include: transactionInclude(), orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.auditEvent.findMany({ include: { actor: true }, orderBy: { createdAt: "desc" }, take: 12 })
  ]);

  return applyAdminOperationFilters({
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase(),
      verificationTier: mapVerificationFromPrisma(user.verificationTier),
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt.toISOString()
    })),
    listings: listings.map((listing) => ({
      id: listing.id,
      domain: listing.domain,
      status: listing.status.toLowerCase(),
      seller: listing.seller.sellerProfile?.publicName ?? listing.seller.displayName ?? listing.seller.email,
      price: centsToDollars(listing.priceCents),
      updatedAt: listing.updatedAt.toISOString()
    })),
    offers: offers.map((offer) => ({
      id: offer.id,
      domain: offer.listing.domain,
      buyerEmail: offer.buyer.email,
      amount: centsToDollars(offer.amountCents),
      status: offer.status.toLowerCase(),
      updatedAt: offer.updatedAt.toISOString()
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      domain: transaction.listing.domain,
      buyerEmail: transaction.buyer.email,
      escrowId: transaction.escrowId,
      amount: centsToDollars(transaction.amountCents),
      status: transaction.status.toLowerCase(),
      updatedAt: transaction.updatedAt.toISOString()
    })),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      actorEmail: event.actor?.email,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      createdAt: event.createdAt.toISOString()
    }))
  }, filters);
}

export async function getAdminEntityDetail(entity: string, identifier: string): Promise<AdminEntityDetail | null> {
  if (!isDatabaseConfigured()) {
    if (entity === "listings") {
      const listing = await getMarketplaceListing(identifier);
      return listing
        ? {
            entity,
            id: listing.id,
            title: listing.domain,
            subtitle: `${listing.status} · ${formatAdminMoney(listing.price)}`,
            sections: [
              {
                title: "Listing",
                rows: adminRows({
                  domain: listing.domain,
                  tld: listing.tld,
                  status: listing.status,
                  price: formatAdminMoney(listing.price),
                  minimumOffer: formatAdminMoney(listing.minimumOffer),
                  category: listing.category,
                  ownershipVerified: listing.ownershipVerified
                })
              },
              {
                title: "AI appraisal",
                rows: adminRows({
                  confidence: `${listing.appraisal.confidence}%`,
                  lowEstimate: formatAdminMoney(listing.appraisal.lowEstimate),
                  highEstimate: formatAdminMoney(listing.appraisal.highEstimate),
                  modelVersion: listing.appraisal.modelVersion
                })
              }
            ]
          }
        : null;
    }

    return null;
  }

  const prisma = getPrisma();
  if (entity === "users") {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: identifier }, { email: identifier.toLowerCase() }]
      },
      include: {
        sellerProfile: true,
        _count: {
          select: {
            listings: true,
            buyerOffers: true,
            buyerTransactions: true,
            supportCases: true,
            watchlists: true,
            searchAlerts: true
          }
        }
      }
    });

    return user
      ? {
          entity,
          id: user.id,
          title: user.email,
          subtitle: `${user.role.toLowerCase()} · ${mapVerificationFromPrisma(user.verificationTier)}`,
          sections: [
            {
              title: "Account",
              rows: adminRows({
                email: user.email,
                displayName: user.displayName,
                role: user.role.toLowerCase(),
                verificationTier: mapVerificationFromPrisma(user.verificationTier),
                twoFactorEnabled: user.twoFactorEnabled,
                clerkUserId: user.clerkUserId,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
              })
            },
            {
              title: "Activity",
              rows: adminRows({
                listings: user._count.listings,
                offers: user._count.buyerOffers,
                transactions: user._count.buyerTransactions,
                supportCases: user._count.supportCases,
                watchlists: user._count.watchlists,
                searchAlerts: user._count.searchAlerts
              })
            },
            ...(user.sellerProfile
              ? [
                  {
                    title: "Seller profile",
                    rows: adminRows({
                      publicName: user.sellerProfile.publicName,
                      slug: user.sellerProfile.slug,
                      payoutPreference: user.sellerProfile.payoutPreference,
                      supportStatus: user.sellerProfile.supportStatus.toLowerCase(),
                      commissionDiscountBps: user.sellerProfile.commissionDiscountBps
                    })
                  }
                ]
              : [])
          ]
        }
      : null;
  }

  if (entity === "listings") {
    const listing = await getPrismaListingByIdOrDomain(identifier);
    return listing
      ? {
          entity,
          id: listing.id,
          title: listing.domain,
          subtitle: `${listing.status.toLowerCase()} · ${formatAdminMoney(centsToDollars(listing.priceCents))}`,
          sections: [
            {
              title: "Listing",
              rows: adminRows({
                domain: listing.domain,
                tld: listing.tld,
                status: listing.status.toLowerCase(),
                listingType: listing.listingType.toLowerCase(),
                registrar: listing.registrar,
                category: listing.category,
                price: formatAdminMoney(centsToDollars(listing.priceCents)),
                minimumOffer: formatAdminMoney(centsToDollars(listing.minimumOfferCents ?? listing.priceCents)),
                trafficMonthly: listing.trafficMonthly,
                domainAgeYears: listing.domainAgeYears,
                landingPageSlug: listing.landingPageSlug,
                createdAt: listing.createdAt,
                updatedAt: listing.updatedAt
              })
            },
            {
              title: "Seller",
              rows: adminRows({
                sellerId: listing.seller.id,
                sellerEmail: listing.seller.email,
                publicName: listing.seller.sellerProfile?.publicName ?? listing.seller.displayName,
                twoFactorEnabled: listing.seller.twoFactorEnabled
              })
            },
            {
              title: "Ownership and AI",
              rows: adminRows({
                ownershipVerification: listing.ownershipVerification,
                brandSignals: listing.brandSignals,
                appraisalConfidence: listing.appraisal?.confidence,
                appraisalRange: listing.appraisal
                  ? `${formatAdminMoney(centsToDollars(listing.appraisal.lowEstimateCents))} - ${formatAdminMoney(centsToDollars(listing.appraisal.highEstimateCents))}`
                  : null,
                modelVersion: listing.appraisal?.modelVersion
              })
            }
          ]
        }
      : null;
  }

  if (entity === "offers") {
    const offer = await getPrismaOfferById(identifier);
    return offer
      ? {
          entity,
          id: offer.id,
          title: `${offer.listing.domain} offer`,
          subtitle: `${offer.status.toLowerCase()} · ${formatAdminMoney(centsToDollars(offer.amountCents))}`,
          sections: [
            {
              title: "Offer",
              rows: adminRows({
                id: offer.id,
                status: offer.status.toLowerCase(),
                amount: formatAdminMoney(centsToDollars(offer.amountCents)),
                buyerVerificationTier: mapVerificationFromPrisma(offer.buyerVerificationTier),
                expiresAt: offer.expiresAt,
                createdAt: offer.createdAt,
                updatedAt: offer.updatedAt
              })
            },
            {
              title: "Parties",
              rows: adminRows({
                listingId: offer.listingId,
                domain: offer.listing.domain,
                buyerEmail: offer.buyer.email,
                seller: offer.listing.seller.sellerProfile?.publicName ?? offer.listing.seller.email
              })
            },
            {
              title: "Negotiation history",
              rows: adminRows({ negotiationHistory: offer.negotiationHistory })
            }
          ]
        }
      : null;
  }

  if (entity === "transactions") {
    const transaction = await prisma.transaction.findFirst({
      where: { OR: [{ id: identifier }, { escrowId: identifier }] },
      include: transactionInclude()
    });
    return transaction
      ? {
          entity,
          id: transaction.id,
          title: `${transaction.listing.domain} transaction`,
          subtitle: `${transaction.status.toLowerCase()} · ${formatAdminMoney(centsToDollars(transaction.amountCents))}`,
          sections: [
            {
              title: "Transaction",
              rows: adminRows({
                id: transaction.id,
                status: transaction.status.toLowerCase(),
                amount: formatAdminMoney(centsToDollars(transaction.amountCents)),
                commission: formatAdminMoney(centsToDollars(transaction.commissionCents)),
                payoutState: transaction.payoutState,
                escrowProvider: transaction.escrowProvider,
                escrowId: transaction.escrowId,
                escrowUrl: transaction.escrowUrl,
                createdAt: transaction.createdAt,
                updatedAt: transaction.updatedAt
              })
            },
            {
              title: "Parties",
              rows: adminRows({
                listingId: transaction.listingId,
                domain: transaction.listing.domain,
                buyerEmail: transaction.buyer.email,
                sellerId: transaction.sellerId,
                offerId: transaction.offerId
              })
            },
            {
              title: "Timeline",
              rows: adminRows({
                statusTimeline: transaction.statusTimeline,
                transferChecklist: transaction.transferChecklist
              })
            }
          ],
          primaryHref: `/transactions/${transaction.id}`
        }
      : null;
  }

  if (entity === "support") {
    const supportCase = await prisma.supportCase.findUnique({
      where: { id: identifier },
      include: { requester: true }
    });
    return supportCase
      ? {
          entity,
          id: supportCase.id,
          title: supportCase.subject,
          subtitle: `${supportCase.status.toLowerCase()} · ${supportCase.requester.email}`,
          sections: [
            {
              title: "Support case",
              rows: adminRows({
                id: supportCase.id,
                subject: supportCase.subject,
                status: supportCase.status.toLowerCase(),
                requesterEmail: supportCase.requester.email,
                transactionId: supportCase.transactionId,
                escalationNotes: supportCase.escalationNotes,
                createdAt: supportCase.createdAt,
                updatedAt: supportCase.updatedAt
              })
            },
            {
              title: "AI drafts",
              rows: adminRows({ aiDraftResponses: supportCase.aiDraftResponses })
            }
          ]
        }
      : null;
  }

  if (entity === "audit") {
    const event = await prisma.auditEvent.findUnique({
      where: { id: identifier },
      include: { actor: true }
    });
    return event
      ? {
          entity,
          id: event.id,
          title: event.eventType,
          subtitle: `${event.entityType} · ${event.actor?.email ?? "system"}`,
          sections: [
            {
              title: "Audit event",
              rows: adminRows({
                id: event.id,
                eventType: event.eventType,
                entityType: event.entityType,
                entityId: event.entityId,
                actorEmail: event.actor?.email,
                createdAt: event.createdAt
              })
            },
            {
              title: "Metadata",
              rows: adminRows({ metadata: event.metadata })
            }
          ]
        }
      : null;
  }

  return null;
}

export async function recordAdminReview(input: {
  actorEmail?: string;
  queueItemId: string;
  action: "approve" | "reject" | "request_evidence" | "escalate";
  note: string;
}) {
  const review = {
    ...input,
    status: input.action === "approve" || input.action === "reject" ? "resolved" : "reviewing",
    auditEvent: {
      eventType: `admin.review.${input.action}`,
      entityType: "admin_queue_item",
      entityId: input.queueItemId,
      metadata: { note: input.note }
    }
  };

  if (isDatabaseConfigured()) {
    const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;
    await getPrisma().auditEvent.create({
      data: {
        actorId: actor?.id,
        ...review.auditEvent
      }
    });
  }

  return review;
}

export async function runModerationScan(input: { actorEmail?: string } = {}) {
  const listings = await listMarketplaceListings();
  const flags = listings.flatMap(scanListingRisk);

  if (isDatabaseConfigured()) {
    const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;
    const prisma = getPrisma();
    for (const flag of flags) {
      await prisma.auditEvent.create({
        data: {
          actorId: actor?.id,
          eventType: "moderation.flag.created",
          entityType: "admin_queue_item",
          entityId: flag.id,
          metadata: flag as unknown as Prisma.InputJsonValue
        }
      });
    }
  }

  return {
    scannedListings: listings.length,
    flags
  };
}

export async function adminUpdateListingStatus(input: {
  listingId: string;
  status: "active" | "flagged" | "archived";
  actorEmail?: string;
  note?: string;
}) {
  if (!isDatabaseConfigured()) {
    return {
      action: "listing_status",
      listingId: input.listingId,
      status: input.status,
      note: input.note,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const listing = await getPrismaListingByIdOrDomain(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  const updated = await prisma.domainListing.update({
    where: { id: listing.id },
    data: {
      status: mapListingStatusToPrisma(input.status)
    },
    include: listingInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.listing.status.updated",
    entityType: "domain_listing",
    entityId: listing.id,
    metadata: {
      domain: listing.domain,
      from: listing.status.toLowerCase(),
      to: input.status,
      note: input.note
    }
  });

  return {
    action: "listing_status",
    listing: mapListing(updated),
    mode: "database"
  };
}

export async function adminVerifySeller(input: {
  sellerEmail: string;
  verificationTier: VerificationTier;
  twoFactorEnabled?: boolean;
  actorEmail?: string;
  note?: string;
}) {
  const twoFactorEnabled = input.twoFactorEnabled ?? input.verificationTier !== "email";

  if (!isDatabaseConfigured()) {
    return {
      action: "seller_verification",
      sellerEmail: input.sellerEmail.toLowerCase(),
      verificationTier: input.verificationTier,
      twoFactorEnabled,
      note: input.note,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const seller = await ensureUser(input.sellerEmail, "SELLER", input.verificationTier);
  const updatedSeller = await prisma.user.update({
    where: { id: seller.id },
    data: {
      role: "SELLER",
      verificationTier: mapVerificationToPrisma(input.verificationTier),
      twoFactorEnabled
    }
  });

  await prisma.sellerProfile.upsert({
    where: { userId: updatedSeller.id },
    update: {
      supportStatus: "OPEN"
    },
    create: {
      userId: updatedSeller.id,
      publicName: updatedSeller.displayName ?? updatedSeller.email.split("@")[0],
      slug: `${(updatedSeller.displayName ?? updatedSeller.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${updatedSeller.id.slice(-6)}`,
      supportStatus: "OPEN"
    }
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.seller.verified",
    entityType: "user",
    entityId: updatedSeller.id,
    metadata: {
      sellerEmail: updatedSeller.email,
      verificationTier: input.verificationTier,
      twoFactorEnabled,
      note: input.note
    }
  });

  return {
    action: "seller_verification",
    seller: {
      id: updatedSeller.id,
      email: updatedSeller.email,
      role: updatedSeller.role.toLowerCase(),
      verificationTier: mapVerificationFromPrisma(updatedSeller.verificationTier),
      twoFactorEnabled: updatedSeller.twoFactorEnabled
    },
    mode: "database"
  };
}

export async function adminCancelOffer(input: { offerId: string; actorEmail?: string; note: string }) {
  if (!isDatabaseConfigured()) {
    return {
      action: "offer_cancel",
      offerId: input.offerId,
      status: "canceled",
      note: input.note,
      mode: "local"
    };
  }

  const existing = await getPrismaOfferById(input.offerId);
  if (!existing) {
    throw new Error("Offer not found.");
  }

  const history = appendJsonArray(existing.negotiationHistory, {
    actor: "admin",
    message: input.note,
    at: new Date().toISOString()
  });
  const updated = await getPrisma().offer.update({
    where: { id: existing.id },
    data: {
      status: PrismaOfferStatus.CANCELED,
      negotiationHistory: history as unknown as Prisma.InputJsonValue
    },
    include: offerInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.offer.canceled",
    entityType: "offer",
    entityId: existing.id,
    metadata: {
      listingId: existing.listingId,
      buyerEmail: existing.buyer.email,
      note: input.note
    }
  });

  return {
    action: "offer_cancel",
    offer: mapOffer(updated),
    mode: "database"
  };
}

export async function adminUpdateSupportCase(input: {
  caseId: string;
  status: SupportCaseItem["status"];
  escalationNotes?: string;
  actorEmail?: string;
}) {
  if (!isDatabaseConfigured()) {
    return {
      action: "support_update",
      caseId: input.caseId,
      status: input.status,
      escalationNotes: input.escalationNotes,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const existing = await prisma.supportCase.findUnique({ where: { id: input.caseId } });
  if (!existing) {
    throw new Error("Support case not found.");
  }

  const updated = await prisma.supportCase.update({
    where: { id: existing.id },
    data: {
      status: mapSupportStatusToPrisma(input.status),
      escalationNotes: input.escalationNotes ?? existing.escalationNotes
    },
    include: { requester: true }
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.support.updated",
    entityType: "support_case",
    entityId: existing.id,
    metadata: {
      from: existing.status.toLowerCase(),
      to: input.status,
      escalationNotes: input.escalationNotes
    }
  });

  return {
    action: "support_update",
    supportCase: mapSupportCase(updated),
    mode: "database"
  };
}

export async function adminAddTransactionDisputeNote(input: {
  transactionId: string;
  actorEmail?: string;
  note: string;
}) {
  if (!isDatabaseConfigured()) {
    return {
      action: "transaction_dispute",
      transactionId: input.transactionId,
      status: "disputed",
      note: input.note,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const existing = await prisma.transaction.findFirst({
    where: {
      OR: [{ id: input.transactionId }, { escrowId: input.transactionId }]
    }
  });
  if (!existing) {
    throw new Error("Transaction not found.");
  }

  const timeline = appendJsonArray(existing.statusTimeline, {
    status: "disputed",
    label: input.note,
    at: new Date().toISOString()
  });
  const updated = await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      status: PrismaTransactionStatus.DISPUTED,
      statusTimeline: timeline as unknown as Prisma.InputJsonValue
    },
    include: transactionInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.transaction.dispute_note",
    entityType: "transaction",
    entityId: existing.id,
    metadata: {
      escrowId: existing.escrowId,
      note: input.note
    }
  });

  return {
    action: "transaction_dispute",
    transaction: mapTransaction(updated),
    mode: "database"
  };
}

export async function updateTransactionOperations(input: {
  transactionId: string;
  actorEmail?: string;
  status?: TransactionStatus;
  checklistUpdates?: Array<{ index: number; done: boolean }>;
  note?: string;
}) {
  if (!isDatabaseConfigured()) {
    return {
      action: "transaction_operations",
      transactionId: input.transactionId,
      status: input.status,
      checklistUpdates: input.checklistUpdates ?? [],
      note: input.note,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const existing = await prisma.transaction.findFirst({
    where: {
      OR: [{ id: input.transactionId }, { escrowId: input.transactionId }]
    }
  });
  if (!existing) {
    throw new Error("Transaction not found.");
  }

  const existingChecklist = Array.isArray(existing.transferChecklist) ? existing.transferChecklist : [];
  const transferChecklist = existingChecklist.map((item, index) => {
    const update = input.checklistUpdates?.find((candidate) => candidate.index === index);
    return update ? { ...(item as Record<string, unknown>), done: update.done } : item;
  });
  const nextStatus = input.status ? mapTransactionStatusToPrisma(input.status) : existing.status;
  const shouldAppendTimeline = Boolean(input.status || input.note);
  const statusTimeline = shouldAppendTimeline
    ? appendJsonArray(existing.statusTimeline, {
        status: input.status ?? existing.status.toLowerCase(),
        label: input.note ?? `Admin updated transaction ${input.status ?? "operations"}.`,
        at: new Date().toISOString()
      })
    : existing.statusTimeline;

  const updated = await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      transferChecklist: transferChecklist as unknown as Prisma.InputJsonValue,
      statusTimeline: statusTimeline as unknown as Prisma.InputJsonValue
    },
    include: transactionInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorEmail,
    eventType: "admin.transaction.operations_updated",
    entityType: "transaction",
    entityId: existing.id,
    metadata: {
      status: input.status,
      checklistUpdates: input.checklistUpdates ?? [],
      note: input.note
    }
  });

  return {
    action: "transaction_operations",
    transaction: mapTransaction(updated),
    mode: "database"
  };
}

export async function createAiOutreachDraft(input: {
  listingId: string;
  targetCompany: string;
  targetEmail?: string;
  context: string;
  actorEmail?: string;
}) {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  const draft = await runGuardedAiDraft({
    kind: "outreach",
    subject: `${listing.domain} outreach for ${input.targetCompany}`,
    context: `${input.context}\nListing: ${listing.domain}\nAsk: ${listing.price}\nSignals: ${listing.brandSignals.join(", ")}`
  });
  const record = {
    id: `outreach_${Date.now()}`,
    listingId: listing.id,
    domain: listing.domain,
    targetCompany: input.targetCompany,
    targetEmail: input.targetEmail,
    draft,
    requiresHumanApproval: true,
    createdAt: new Date().toISOString()
  };

  if (isDatabaseConfigured()) {
    const actor = input.actorEmail ? await ensureUser(input.actorEmail, "SELLER") : null;
    await getPrisma().auditEvent.create({
      data: {
        actorId: actor?.id,
        eventType: "ai.outreach.draft.created",
        entityType: "domain_listing",
        entityId: listing.id,
        metadata: record as unknown as Prisma.InputJsonValue
      }
    });
  }

  return record;
}

function listingInclude() {
  return domainListingInclude;
}

function offerInclude() {
  return offerIncludeConfig;
}

function transactionInclude() {
  return transactionIncludeConfig;
}

async function getPrismaListingByIdOrDomain(identifier: string) {
  const prisma = getPrisma();
  return prisma.domainListing.findFirst({
    where: {
      OR: [{ id: identifier }, { domain: normalizeDomain(identifier) }]
    },
    include: listingInclude()
  });
}

async function getPrismaOfferById(offerId: string) {
  return getPrisma().offer.findUnique({
    where: { id: offerId },
    include: offerInclude()
  });
}

async function ensureUser(
  email: string,
  role: "BUYER" | "SELLER" | "ADMIN",
  verificationTier: VerificationTier = role === "BUYER" ? "email" : "two_factor"
) {
  const prisma = getPrisma();
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {
      role,
      verificationTier: mapVerificationToPrisma(verificationTier),
      twoFactorEnabled: verificationTier !== "email"
    },
    create: {
      clerkUserId: `local:${email.toLowerCase()}`,
      email: email.toLowerCase(),
      displayName: email.split("@")[0],
      role,
      verificationTier: mapVerificationToPrisma(verificationTier),
      twoFactorEnabled: verificationTier !== "email"
    }
  });

  if (role === "SELLER") {
    await prisma.sellerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        publicName: user.displayName ?? "GetThe Seller",
        slug: (user.displayName ?? "getthe-seller").toLowerCase().replace(/[^a-z0-9]+/g, "-")
      }
    });
  }

  return user;
}

function mapListing(row: NonNullable<PrismaListing>): DomainListing {
  return {
    id: row.id,
    domain: row.domain,
    tld: getTld(row.domain),
    registrar: row.registrar ?? "Unknown",
    seller: {
      id: row.seller.id,
      publicName: row.seller.sellerProfile?.publicName ?? row.seller.displayName ?? "Verified Seller",
      slug: row.seller.sellerProfile?.slug ?? row.seller.id,
      verified: row.seller.twoFactorEnabled,
      transactionCount: 0,
      avgResponseHours: 6
    },
    status: row.status.toLowerCase() as DomainListing["status"],
    listingType: row.listingType.toLowerCase() as ListingType,
    price: centsToDollars(row.priceCents),
    minimumOffer: centsToDollars(row.minimumOfferCents ?? row.priceCents),
    commissionRate: row.commissionBps / 10000,
    ownershipVerified: row.status === "ACTIVE" || Boolean((row.ownershipVerification as { verifiedAt?: string })?.verifiedAt),
    description: row.description,
    category: row.category,
    trafficMonthly: row.trafficMonthly,
    domainAgeYears: row.domainAgeYears,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    brandSignals: Array.isArray(row.brandSignals) ? (row.brandSignals as string[]) : [],
    createdAt: row.createdAt.toISOString(),
    appraisal: row.appraisal ? mapAppraisal(row.appraisal) : appraiseDomain(row.domain)
  };
}

function mapAppraisal(row: {
  domain: string;
  lowEstimateCents: number;
  highEstimateCents: number;
  confidence: number;
  comparableSales: unknown;
  keywordSignals: unknown;
  brandabilityNotes: string;
  generatedSummary: string;
  modelVersion: string;
}): Appraisal {
  return {
    domain: row.domain,
    lowEstimate: centsToDollars(row.lowEstimateCents),
    highEstimate: centsToDollars(row.highEstimateCents),
    confidence: row.confidence,
    comparableSales: Array.isArray(row.comparableSales) ? (row.comparableSales as Appraisal["comparableSales"]) : [],
    keywordSignals: Array.isArray(row.keywordSignals) ? (row.keywordSignals as string[]) : [],
    brandabilityNotes: row.brandabilityNotes,
    generatedSummary: row.generatedSummary,
    modelVersion: row.modelVersion,
    disclaimer: appraiseDomain(row.domain).disclaimer
  };
}

function mapOffer(row: NonNullable<PrismaOffer>): Offer {
  return {
    id: row.id,
    listingId: row.listingId,
    buyerEmail: row.buyer.email,
    amount: centsToDollars(row.amountCents),
    status: row.status.toLowerCase() as Offer["status"],
    buyerVerificationTier: mapVerificationFromPrisma(row.buyerVerificationTier),
    expiresAt: row.expiresAt.toISOString(),
    negotiationHistory: Array.isArray(row.negotiationHistory) ? (row.negotiationHistory as Offer["negotiationHistory"]) : []
  };
}

function mapTransaction(row: NonNullable<PrismaTransaction>): Transaction {
  return {
    id: row.id,
    listingId: row.listingId,
    offerId: row.offerId ?? undefined,
    buyerEmail: row.buyer.email,
    sellerId: row.sellerId,
    escrowProvider: "escrow.com",
    escrowId: row.escrowId ?? row.id,
    escrowUrl: row.escrowUrl ?? `https://www.escrow.com/transaction/${row.escrowId}`,
    amount: centsToDollars(row.amountCents),
    commission: centsToDollars(row.commissionCents),
    status: row.status.toLowerCase() as TransactionStatus,
    statusTimeline: Array.isArray(row.statusTimeline) ? (row.statusTimeline as Transaction["statusTimeline"]) : [],
    transferChecklist: Array.isArray(row.transferChecklist) ? (row.transferChecklist as Transaction["transferChecklist"]) : []
  };
}

function mapAppraisalToCreate(appraisal: Appraisal) {
  return {
    domain: appraisal.domain,
    lowEstimateCents: dollarsToCents(appraisal.lowEstimate),
    highEstimateCents: dollarsToCents(appraisal.highEstimate),
    confidence: appraisal.confidence,
    comparableSales: appraisal.comparableSales as unknown as Prisma.InputJsonValue,
    keywordSignals: appraisal.keywordSignals as Prisma.InputJsonValue,
    brandabilityNotes: appraisal.brandabilityNotes,
    generatedSummary: appraisal.generatedSummary,
    modelVersion: appraisal.modelVersion,
    disclaimerAccepted: false
  };
}

function mapVerificationToPrisma(tier: VerificationTier) {
  return tier.toUpperCase() as "EMAIL" | "TWO_FACTOR" | "ESCROW_INTENT" | "KYC_REVIEW";
}

function mapVerificationFromPrisma(tier: string): VerificationTier {
  return tier.toLowerCase() as VerificationTier;
}

function mapListingStatusToPrisma(status: "active" | "flagged" | "archived") {
  const map = {
    active: PrismaListingStatus.ACTIVE,
    flagged: PrismaListingStatus.FLAGGED,
    archived: PrismaListingStatus.ARCHIVED
  };

  return map[status];
}

function mapSupportStatusToPrisma(status: SupportCaseItem["status"]) {
  const map = {
    open: PrismaSupportStatus.OPEN,
    waiting_on_user: PrismaSupportStatus.WAITING_ON_USER,
    escalated: PrismaSupportStatus.ESCALATED,
    resolved: PrismaSupportStatus.RESOLVED
  };

  return map[status];
}

function mapTransactionStatusToPrisma(status: TransactionStatus) {
  return status.toUpperCase() as PrismaTransactionStatus;
}

function appendJsonArray(value: unknown, entry: unknown) {
  return [...(Array.isArray(value) ? value : []), entry];
}

function applyAdminOperationFilters<T extends {
  users: Array<Record<string, unknown>>;
  listings: Array<Record<string, unknown>>;
  offers: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
}>(operations: T, filters: AdminOperationFilters): T {
  const q = filters.q?.trim().toLowerCase();
  const status = filters.status?.trim().toLowerCase();
  const kind = filters.kind ?? "all";

  const matchesText = (row: Record<string, unknown>) => {
    if (!q) return true;
    return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(q));
  };
  const matchesStatus = (row: Record<string, unknown>) => {
    if (!status || status === "all") return true;
    return String(row.status ?? row.role ?? row.eventType ?? "").toLowerCase().includes(status);
  };
  const filterRows = (rows: Array<Record<string, unknown>>, rowKind: AdminOperationFilters["kind"]) => {
    if (kind !== "all" && kind !== rowKind) return [];
    return rows.filter((row) => matchesText(row) && matchesStatus(row));
  };

  return {
    ...operations,
    users: filterRows(operations.users, "users"),
    listings: filterRows(operations.listings, "listings"),
    offers: filterRows(operations.offers, "offers"),
    transactions: filterRows(operations.transactions, "transactions"),
    auditEvents: filterRows(operations.auditEvents, "audit")
  };
}

function adminRows(values: Record<string, unknown>) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => {
      const formatted = formatAdminValue(value);
      return {
        label,
        value: formatted.value,
        preformatted: formatted.preformatted
      };
    });
}

function formatAdminValue(value: unknown) {
  if (value instanceof Date) {
    return { value: value.toISOString(), preformatted: false };
  }

  if (typeof value === "boolean") {
    return { value: value ? "yes" : "no", preformatted: false };
  }

  if (typeof value === "object" && value !== null) {
    return { value: JSON.stringify(value, null, 2), preformatted: true };
  }

  return { value: String(value), preformatted: false };
}

function formatAdminMoney(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

async function createAdminAudit(input: {
  actorEmail?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured()) {
    return;
  }

  const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;
  await getPrisma().auditEvent.create({
    data: {
      actorId: actor?.id,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue
    }
  });
}

function mapSupportCase(row: {
  id: string;
  requester: { email: string };
  subject: string;
  status: string;
  transactionId: string | null;
  aiDraftResponses: unknown;
  escalationNotes: string | null;
  createdAt: Date;
}): SupportCaseItem {
  return {
    id: row.id,
    requesterEmail: row.requester.email,
    subject: row.subject,
    status: row.status.toLowerCase() as SupportCaseItem["status"],
    transactionId: row.transactionId ?? undefined,
    aiDraftResponses: Array.isArray(row.aiDraftResponses)
      ? (row.aiDraftResponses as SupportCaseItem["aiDraftResponses"])
      : [],
    escalationNotes: row.escalationNotes ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

function mapEscrowStatus(status: string | undefined): TransactionStatus {
  const normalized = status?.toLowerCase();
  if (normalized?.includes("fund")) return "buyer_funded";
  if (normalized?.includes("transfer")) return "domain_transfer_started";
  if (normalized?.includes("verify")) return "transfer_verified";
  if (normalized?.includes("release") || normalized?.includes("complete")) return "payout_complete";
  if (normalized?.includes("cancel")) return "canceled";
  if (normalized?.includes("dispute")) return "disputed";
  return "escrow_started";
}

function dollarsToCents(value: number) {
  return Math.round(value * 100);
}

function centsToDollars(value: number) {
  return Math.round(value) / 100;
}

function cryptoSafeId() {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}`;
}

export type { AdminQueueItem };
