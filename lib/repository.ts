import { addDays } from "date-fns";
import { Prisma, TransactionStatus as PrismaTransactionStatus } from "@prisma/client";
import { appraiseDomain, getTld, isValidDomain, normalizeDomain } from "@/lib/appraisal";
import { COMMISSION_RATE } from "@/lib/constants";
import { createEscrowHandoff } from "@/lib/escrow";
import { parsePortfolioCsv } from "@/lib/imports";
import { scanListingRisk } from "@/lib/moderation";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { adminQueue, listings as seedListings } from "@/lib/seed";
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

export async function listMarketplaceListings(filters: DomainFilters = {}) {
  if (!isDatabaseConfigured()) {
    return filterAndSortListings(seedListings, filters);
  }

  const prisma = getPrisma();
  const rows = await prisma.domainListing.findMany({
    include: listingInclude(),
    orderBy: { createdAt: "desc" }
  });

  return filterAndSortListings(rows.map(mapListing), filters);
}

export async function getMarketplaceListing(identifier: string) {
  if (!isDatabaseConfigured()) {
    return getSeedListing(identifier) ?? seedListings.find((listing) => listing.id === identifier) ?? null;
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
    method: "dns_txt",
    record: `_getthe-verify.${domain}`,
    value: `getthe=${cryptoSafeId()}`
  };

  if (!isDatabaseConfigured()) {
    return {
      id: `draft_${Date.now()}`,
      domain,
      tld: getTld(domain),
      status: "pending_verification",
      price: input.price,
      minimumOffer: input.minimumOffer ?? Math.round(input.price * 0.65),
      registrar: input.registrar,
      category: input.category,
      ownershipVerification,
      appraisal
    };
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
    return {
      listing: {
        ...listing,
        status: "active",
        ownershipVerified: true
      },
      verification: {
        method: input.method,
        verifiedAt: new Date().toISOString(),
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

export async function getAdminOverview() {
  const activeListings = await listMarketplaceListings();
  const supportCases = await listSupportCases();
  const gmv = activeListings.reduce((sum, listing) => sum + listing.price, 0);
  const commission = Math.round(gmv * COMMISSION_RATE);

  return {
    activeListings,
    gmv,
    commission,
    queue: adminQueue,
    supportCases
  };
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
