import { addDays } from "date-fns";
import {
  ListingStatus as PrismaListingStatus,
  OfferStatus as PrismaOfferStatus,
  Prisma,
  TransactionStatus as PrismaTransactionStatus
} from "@prisma/client";
import { appraiseDomain, getTld, isValidDomain, normalizeDomain } from "@/lib/appraisal";
import { COMMISSION_RATE } from "@/lib/constants";
import { EscrowApiError, createEscrowHandoff, fetchEscrowTransaction, type EscrowHandoff } from "@/lib/escrow";
import { parsePortfolioCsv } from "@/lib/imports";
import { scanListingRisk } from "@/lib/moderation";
import { sendMarketplaceNotification } from "@/lib/notifications";
import { verifyOwnershipChallenge, type OwnershipVerificationMethod } from "@/lib/ownership-verification";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { searchPostgresListingIds, searchPostgresListings } from "@/lib/postgres-search";
import { adminQueue, listings as seedListings } from "@/lib/seed";
import { canQuerySearchIndex, searchIndexedListingIds } from "@/lib/search-index";
import { filterAndSortListings, getListing as getSeedListing } from "@/lib/search";
import {
  assertListingTransition,
  assertOfferTransition,
  assertTransactionTransition,
  calculateCommission,
  canPlaceOffer
} from "@/lib/transactions";
import type {
  AdminQueueItem,
  DomainFacets,
  DomainFilters,
  DomainListing,
  DomainSearchResult,
  ListingType,
  NotificationPreferences,
  Offer,
  OfferInboxItem,
  OperationalAnalytics,
  ParkedInquiry,
  SearchAlertItem,
  SellerInventoryItem,
  SellerProfilePage,
  SupportCaseItem,
  Transaction,
  TransactionDashboardItem,
  TransactionStatus,
  VerificationTier,
  WatchlistItem
} from "@/lib/types";
import { runGuardedAiDraft } from "@/lib/ai";
import {
  adminRows,
  applyAdminOperationFilters,
  formatAdminMoney,
  normalizeAdminQueueItem,
  severityRank
} from "@/lib/repository/internal/admin";
import type { AdminEntityDetail, AdminOperationFilters } from "@/lib/repository/internal/admin";
import { listingInclude, offerInclude, transactionInclude } from "@/lib/repository/internal/includes";
import type { PrismaListing } from "@/lib/repository/internal/includes";
import {
  applyLocalListingOverride,
  getLocalListings,
  getLocalListingsForSeller,
  getSellerEmailForListing,
  isLocalDefaultSellerEmail,
  localDraftListings,
  localListingDetailOverrides,
  localListingStatusOverrides,
  localNotificationPreferences,
  localOffers,
  localParkedInquiries,
  localSearchAlerts,
  localSellerEmail,
  localSellerForEmail,
  localTransactions,
  localWatchlistItems
} from "@/lib/repository/internal/local-store";
import {
  buildSellerProfilePage,
  mapAppraisalToCreate,
  mapEscrowStatus,
  mapListing,
  mapListingStatusToPrisma,
  mapListingTypeToPrisma,
  mapLocalTransactionDashboardItem,
  mapOffer,
  mapOfferInbox,
  mapSupportCase,
  mapSupportStatusToPrisma,
  mapTransaction,
  mapTransactionDashboardItem,
  mapTransactionStatusToPrisma,
  mapVerificationFromPrisma,
  mapVerificationToPrisma
} from "@/lib/repository/internal/mappers";
import {
  createAdminAudit,
  ensureUser,
  getPrismaListingByIdOrDomain,
  getPrismaOfferById
} from "@/lib/repository/internal/prisma";
import type { LocalDraftListing } from "@/lib/repository/internal/types";
import {
  appendJsonArray,
  centsToDollars,
  cryptoSafeId,
  defaultNotificationPreferences,
  defaultSearchLimit,
  dollarsToCents,
  inquiryMatchesQuery,
  isListingOwnershipVerified,
  isOpenOfferStatus,
  maxSearchLimit,
  mergeChecklistItem,
  mergeInquiryAuditEvents,
  normalizeNotificationPreferences,
  ownershipVerificationStatus,
  rate,
  shouldDeliverAlert
} from "@/lib/repository/internal/utils";

export async function listMarketplaceListings(filters: DomainFilters = {}) {
  if (!isDatabaseConfigured()) {
    return filterAndSortListings(getLocalListings(), filters);
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

export async function searchMarketplaceListings(
  filters: DomainFilters = {},
  options: { page?: number; limit?: number } = {}
): Promise<DomainSearchResult> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(maxSearchLimit, Math.max(1, Math.trunc(options.limit ?? defaultSearchLimit)));

  if (!isDatabaseConfigured()) {
    const allResults = filterAndSortListings(getLocalListings(), filters);
    return {
      results: allResults.slice((page - 1) * limit, page * limit),
      filters,
      pagination: buildPagination(page, limit, allResults.length),
      facets: buildLocalFacets(allResults)
    };
  }

  const prisma = getPrisma();
  if (canQuerySearchIndex()) {
    const indexedIds = await searchIndexedListingIds(filters).catch(() => null);
    if (indexedIds) {
      const pagedIds = indexedIds.slice((page - 1) * limit, page * limit);
      const allListings = await hydrateListingsInOrder(indexedIds);
      return {
        results: await hydrateListingsInOrder(pagedIds),
        filters,
        pagination: buildPagination(page, limit, indexedIds.length),
        facets: buildLocalFacets(allListings)
      };
    }
  }

  const search = await searchPostgresListings(prisma, filters, { page, limit });
  return {
    results: await hydrateListingsInOrder(search.ids),
    filters,
    pagination: buildPagination(page, limit, search.total),
    facets: search.facets
  };
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
    return filterAndSortListings(getLocalListings());
  }

  const prisma = getPrisma();
  const rows = await prisma.domainListing.findMany({
    where: { status: "ACTIVE" },
    include: listingInclude(),
    orderBy: { updatedAt: "desc" }
  });

  return rows.map(mapListing);
}

function buildPagination(page: number, limit: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  return {
    page: currentPage,
    limit,
    total,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1
  };
}

function buildLocalFacets(results: DomainListing[]): DomainFacets {
  return {
    tlds: countFacet(results.map((listing) => listing.tld), (value) => `.${value}`),
    categories: countFacet(results.map((listing) => listing.category)),
    listingTypes: countFacet(results.map((listing) => listing.listingType), (value) => value.replaceAll("_", " ")),
    priceBands: [
      { value: "under_5k", label: "Under $5K", count: results.filter((listing) => listing.price < 5000).length },
      { value: "5k_10k", label: "$5K-$10K", count: results.filter((listing) => listing.price >= 5000 && listing.price < 10000).length },
      { value: "10k_25k", label: "$10K-$25K", count: results.filter((listing) => listing.price >= 10000 && listing.price < 25000).length },
      { value: "25k_plus", label: "$25K+", count: results.filter((listing) => listing.price >= 25000).length }
    ]
  };
}

function countFacet(values: string[], labelFor: (value: string) => string = (value) => value) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: labelFor(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function getMarketplaceListing(identifier: string) {
  if (!isDatabaseConfigured()) {
    const normalizedIdentifier = identifier.toLowerCase();
    const localDraft = getLocalListings().find(
      (listing) => listing.id === identifier || listing.domain === normalizedIdentifier
    );

    return localDraft ?? applyLocalListingOverride(getSeedListing(identifier)) ?? null;
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

  if ((await getMarketplaceListing(domain))) {
    throw new Error("Duplicate domain listing.");
  }

  const appraisal = appraiseDomain(domain);
  const ownershipVerification = {
    method: "dns_txt" as const,
    record: `_getthe-verify.${domain}`,
    value: `getthe=${cryptoSafeId()}`
  };

  if (!isDatabaseConfigured()) {
    const localSeller = localSellerForEmail(input.sellerEmail);
    const draft: LocalDraftListing = {
      id: `draft_${Date.now()}`,
      domain,
      tld: getTld(domain),
      status: "pending_verification",
      price: input.price,
      minimumOffer: input.minimumOffer ?? Math.round(input.price * 0.65),
      registrar: input.registrar ?? "Unknown",
      seller: localSeller.profile,
      sellerEmail: localSeller.email,
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
  method: OwnershipVerificationMethod;
  token?: string;
  actorEmail?: string;
  actorRole?: "seller" | "admin";
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

  const existingVerification = row.ownershipVerification as { record?: string; value?: string };
  const challenge = await verifyOwnershipChallenge({
    domain: row.domain,
    method: input.method,
    expectedRecord: existingVerification.record,
    expectedValue: existingVerification.value,
    token: input.token,
    actorRole: input.actorRole
  });
  const attemptedAt = new Date().toISOString();

  if (!challenge.verified) {
    await prisma.domainListing.update({
      where: { id: row.id },
      data: {
        ownershipVerification: {
          ...existingVerification,
          method: input.method,
          status: "failed",
          lastAttemptAt: attemptedAt,
          lastError: challenge.reason,
          evidence: challenge.evidence.slice(0, 10)
        } as Prisma.InputJsonValue
      }
    });

    await prisma.auditEvent.create({
      data: {
        eventType: "listing.ownership.verification_failed",
        entityType: "domain_listing",
        entityId: row.id,
        metadata: {
          method: input.method,
          reason: challenge.reason,
          record: challenge.record,
          attemptedAt
        } as Prisma.InputJsonValue
      }
    });

    throw new Error(challenge.reason ?? "Ownership verification failed.");
  }

  const verifiedAt = new Date().toISOString();
  const updated = await prisma.domainListing.update({
    where: { id: row.id },
    data: {
      status: "ACTIVE",
      ownershipVerification: {
        ...existingVerification,
        method: input.method,
        status: "verified",
        record: challenge.record ?? existingVerification.record,
        verifiedAt,
        verifiedBy: input.actorEmail ?? "system",
        evidence: challenge.evidence.slice(0, 10)
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

export async function listSellerInventory(input: {
  email: string;
  role?: "seller" | "admin" | "buyer";
}): Promise<SellerInventoryItem[]> {
  if (!isDatabaseConfigured()) {
    return getLocalListingsForSeller(input).map((listing) => ({
      id: listing.id,
      domain: listing.domain,
      status: listing.status,
      listingType: listing.listingType,
      price: listing.price,
      minimumOffer: listing.minimumOffer,
      ownershipVerified: listing.ownershipVerified,
      verificationStatus: listing.ownershipVerified ? "verified" : "pending",
      offerCount: localOffers.filter((offer) => offer.listingId === listing.id).length,
      openOfferCount: localOffers.filter((offer) => offer.listingId === listing.id && isOpenOfferStatus(offer.status)).length,
      updatedAt: listing.createdAt
    }));
  }

  const rows = await getPrisma().domainListing.findMany({
    where: input.role === "admin" ? {} : { seller: { email: input.email.toLowerCase() } },
    include: {
      ...listingInclude(),
      offers: {
        select: {
          status: true
        }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return rows.map((row) => ({
    id: row.id,
    domain: row.domain,
    status: row.status.toLowerCase() as DomainListing["status"],
    listingType: row.listingType.toLowerCase() as ListingType,
    price: centsToDollars(row.priceCents),
    minimumOffer: centsToDollars(row.minimumOfferCents ?? row.priceCents),
    ownershipVerified: isListingOwnershipVerified(row.status.toLowerCase() as DomainListing["status"], row.ownershipVerification),
    verificationStatus: ownershipVerificationStatus(row.ownershipVerification),
    offerCount: row.offers.length,
    openOfferCount: row.offers.filter((offer) => isOpenOfferStatus(offer.status.toLowerCase() as Offer["status"])).length,
    updatedAt: row.updatedAt.toISOString()
  }));
}

export async function listSellerListings(input: {
  email: string;
  role?: "seller" | "admin" | "buyer";
}): Promise<DomainListing[]> {
  if (!isDatabaseConfigured()) {
    return getLocalListingsForSeller(input);
  }

  const rows = await getPrisma().domainListing.findMany({
    where: input.role === "admin" ? {} : { seller: { email: input.email.toLowerCase() } },
    include: listingInclude(),
    orderBy: { updatedAt: "desc" }
  });

  return rows.map(mapListing);
}

export async function updateSellerListingStatus(input: {
  listingId: string;
  status: "draft" | "active" | "archived";
  actorEmail: string;
  actorRole: "seller" | "admin";
}) {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (input.status === "active" && !listing.ownershipVerified && input.actorRole !== "admin") {
    throw new Error("Verify ownership before publishing this listing.");
  }

  if (!isDatabaseConfigured()) {
    localListingStatusOverrides.set(listing.id, input.status);
    return {
      action: "seller_listing_status",
      listing: {
        ...listing,
        status: input.status
      },
      mode: "local"
    };
  }

  const row = await getPrismaListingByIdOrDomain(input.listingId);
  if (!row) {
    throw new Error("Listing not found.");
  }

  if (input.actorRole !== "admin" && row.seller.email.toLowerCase() !== input.actorEmail.toLowerCase()) {
    throw new Error("Only the seller of record can update this listing.");
  }

  assertListingTransition(
    row.status.toLowerCase() as Parameters<typeof assertListingTransition>[0],
    input.status
  );
  const updated = await getPrisma().domainListing.update({
    where: { id: row.id },
    data: {
      status: mapListingStatusToPrisma(input.status)
    },
    include: listingInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorRole === "admin" ? input.actorEmail : undefined,
    eventType: input.actorRole === "admin" ? "admin.listing.status.updated" : "seller.listing.status.updated",
    entityType: "domain_listing",
    entityId: row.id,
    metadata: {
      domain: row.domain,
      from: row.status.toLowerCase(),
      to: input.status,
      actorEmail: input.actorEmail
    }
  });

  return {
    action: "seller_listing_status",
    listing: mapListing(updated),
    mode: "database"
  };
}

export async function updateSellerListingDetails(input: {
  listingId: string;
  actorEmail: string;
  actorRole: "seller" | "admin";
  price: number;
  minimumOffer?: number;
  registrar?: string;
  category: string;
  listingType: ListingType;
  description: string;
  trafficMonthly?: number;
  domainAgeYears?: number;
  seoTitle: string;
  seoDescription: string;
}) {
  if (input.price <= 0) {
    throw new Error("Price must be positive.");
  }

  if (input.minimumOffer && input.minimumOffer <= 0) {
    throw new Error("Minimum offer must be positive.");
  }

  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (!isDatabaseConfigured()) {
    const nextListing: DomainListing = {
      ...listing,
      price: input.price,
      minimumOffer: input.minimumOffer ?? listing.minimumOffer,
      registrar: input.registrar ?? listing.registrar,
      category: input.category,
      listingType: input.listingType,
      description: input.description,
      trafficMonthly: input.trafficMonthly ?? listing.trafficMonthly,
      domainAgeYears: input.domainAgeYears ?? listing.domainAgeYears,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription
    };
    localListingDetailOverrides.set(listing.id, nextListing);

    return {
      action: "seller_listing_update",
      listing: nextListing,
      mode: "local"
    };
  }

  const row = await getPrismaListingByIdOrDomain(input.listingId);
  if (!row) {
    throw new Error("Listing not found.");
  }

  if (input.actorRole !== "admin" && row.seller.email.toLowerCase() !== input.actorEmail.toLowerCase()) {
    throw new Error("Only the seller of record can update this listing.");
  }

  const updated = await getPrisma().domainListing.update({
    where: { id: row.id },
    data: {
      registrar: input.registrar,
      category: input.category,
      listingType: mapListingTypeToPrisma(input.listingType),
      priceCents: dollarsToCents(input.price),
      minimumOfferCents: dollarsToCents(input.minimumOffer ?? input.price),
      description: input.description,
      trafficMonthly: Math.max(0, Math.trunc(input.trafficMonthly ?? 0)),
      domainAgeYears: Math.max(0, Math.trunc(input.domainAgeYears ?? 0)),
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription
    },
    include: listingInclude()
  });

  await createAdminAudit({
    actorEmail: input.actorRole === "admin" ? input.actorEmail : undefined,
    eventType: input.actorRole === "admin" ? "admin.listing.details.updated" : "seller.listing.details.updated",
    entityType: "domain_listing",
    entityId: row.id,
    metadata: {
      domain: row.domain,
      actorEmail: input.actorEmail,
      price: input.price,
      listingType: input.listingType
    }
  });

  return {
    action: "seller_listing_update",
    listing: mapListing(updated),
    mode: "database"
  };
}

export async function deleteSellerListing(input: {
  listingId: string;
  actorEmail: string;
  actorRole: "seller" | "admin";
}) {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (!isDatabaseConfigured()) {
    const draftIndex = localDraftListings.findIndex((item) => item.id === listing.id);
    if (draftIndex >= 0) {
      localDraftListings.splice(draftIndex, 1);
      localListingDetailOverrides.delete(listing.id);
      localListingStatusOverrides.delete(listing.id);
      return {
        action: "seller_listing_delete",
        listingId: listing.id,
        deleted: true,
        archived: false,
        mode: "local"
      };
    }

    localListingStatusOverrides.set(listing.id, "archived");
    return {
      action: "seller_listing_delete",
      listingId: listing.id,
      deleted: false,
      archived: true,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const row = await prisma.domainListing.findFirst({
    where: {
      OR: [{ id: input.listingId }, { domain: normalizeDomain(input.listingId) }]
    },
    include: {
      seller: true,
      _count: {
        select: {
          offers: true,
          transactions: true
        }
      }
    }
  });
  if (!row) {
    throw new Error("Listing not found.");
  }

  if (input.actorRole !== "admin" && row.seller.email.toLowerCase() !== input.actorEmail.toLowerCase()) {
    throw new Error("Only the seller of record can delete this listing.");
  }

  if (row._count.offers || row._count.transactions) {
    await prisma.domainListing.update({
      where: { id: row.id },
      data: { status: PrismaListingStatus.ARCHIVED }
    });
    await createAdminAudit({
      actorEmail: input.actorRole === "admin" ? input.actorEmail : undefined,
      eventType: "seller.listing.archived_for_history",
      entityType: "domain_listing",
      entityId: row.id,
      metadata: {
        domain: row.domain,
        actorEmail: input.actorEmail,
        offers: row._count.offers,
        transactions: row._count.transactions
      }
    });

    return {
      action: "seller_listing_delete",
      listingId: row.id,
      deleted: false,
      archived: true,
      mode: "database"
    };
  }

  await prisma.$transaction([
    prisma.watchlist.deleteMany({ where: { listingId: row.id } }),
    prisma.appraisal.deleteMany({ where: { listingId: row.id } }),
    prisma.domainListing.delete({ where: { id: row.id } })
  ]);

  await createAdminAudit({
    actorEmail: input.actorRole === "admin" ? input.actorEmail : undefined,
    eventType: input.actorRole === "admin" ? "admin.listing.deleted" : "seller.listing.deleted",
    entityType: "domain_listing",
    entityId: row.id,
    metadata: {
      domain: row.domain,
      actorEmail: input.actorEmail
    }
  });

  return {
    action: "seller_listing_delete",
    listingId: row.id,
    deleted: true,
    archived: false,
    mode: "database"
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
    localOffers.unshift({
      id: offer.id,
      domain: listing.domain,
      listingId: listing.id,
      buyerEmail: input.buyerEmail.toLowerCase(),
      sellerEmail: localSellerEmail(listing),
      sellerName: listing.seller.publicName,
      amount: offer.amount,
      status: offer.status,
      buyerVerificationTier: offer.buyerVerificationTier,
      expiresAt: offer.expiresAt,
      updatedAt: new Date().toISOString()
    });
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
    const existing = localOffers.find((offer) => offer.id === input.offerId);
    if (existing) {
      existing.status = input.action === "accept" ? "accepted" : input.action === "reject" ? "rejected" : "countered";
      existing.amount = input.amount ?? existing.amount;
      existing.updatedAt = new Date().toISOString();
    }

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
  assertOfferTransition(
    existing.status.toLowerCase() as Parameters<typeof assertOfferTransition>[0],
    nextStatus.toLowerCase() as Parameters<typeof assertOfferTransition>[0]
  );
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

export async function listOfferInbox(input: {
  email: string;
  role: "buyer" | "seller" | "admin";
}): Promise<OfferInboxItem[]> {
  if (!isDatabaseConfigured()) {
    const email = input.email.toLowerCase();
    return localOffers
      .filter((offer) => {
        if (input.role === "admin" || input.role === "seller") return true;
        return offer.buyerEmail.toLowerCase() === email;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const rows = await getPrisma().offer.findMany({
    where:
      input.role === "admin"
        ? {}
        : input.role === "seller"
          ? { listing: { seller: { email: input.email.toLowerCase() } } }
          : { buyer: { email: input.email.toLowerCase() } },
    include: offerInclude(),
    orderBy: { updatedAt: "desc" },
    take: 50
  });

  return rows.map(mapOfferInbox);
}

export async function getListingNotificationContext(listingId: string) {
  const listing = await getMarketplaceListing(listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (!isDatabaseConfigured()) {
    return {
      listingId: listing.id,
      domain: listing.domain,
      sellerEmail: localSellerEmail(listing),
      sellerName: listing.seller.publicName
    };
  }

  const row = await getPrismaListingByIdOrDomain(listingId);
  if (!row) {
    throw new Error("Listing not found.");
  }

  return {
    listingId: row.id,
    domain: row.domain,
    sellerEmail: row.seller.email,
    sellerName: row.seller.sellerProfile?.publicName ?? row.seller.displayName ?? row.seller.email
  };
}

export async function getOfferNotificationContext(offerId: string) {
  if (!isDatabaseConfigured()) {
    const offer = localOffers.find((item) => item.id === offerId);
    if (!offer) {
      return null;
    }

    return {
      offerId: offer.id,
      listingId: offer.listingId,
      domain: offer.domain,
      buyerEmail: offer.buyerEmail,
      sellerEmail: offer.sellerEmail,
      sellerName: offer.sellerName
    };
  }

  const offer = await getPrismaOfferById(offerId);
  if (!offer) {
    return null;
  }

  return {
    offerId: offer.id,
    listingId: offer.listingId,
    domain: offer.listing.domain,
    buyerEmail: offer.buyer.email,
    sellerEmail: offer.listing.seller.email,
    sellerName: offer.listing.seller.sellerProfile?.publicName ?? offer.listing.seller.displayName ?? offer.listing.seller.email
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
  const sellerEmail = await getSellerEmailForListing(listing);
  let handoff: EscrowHandoff | null = null;
  let handoffError: Error | null = null;
  try {
    handoff = await createEscrowHandoff({
      listing,
      buyerEmail: input.buyerEmail,
      sellerEmail,
      amount
    });
  } catch (error) {
    handoffError = error instanceof Error ? error : new Error("Escrow.com handoff failed.");
    if (isDatabaseConfigured()) {
      const metadata: Record<string, unknown> = {
        listingId: listing.id,
        buyerEmail: input.buyerEmail,
        amount,
        message: handoffError.message
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

    if (!isDatabaseConfigured()) {
      throw handoffError;
    }
  }

  const now = new Date().toISOString();
  const transaction: Transaction = {
    id: `txn_${Date.now()}`,
    listingId: listing.id,
    offerId: input.offerId,
    buyerEmail: input.buyerEmail,
    sellerId: listing.seller.id,
    escrowProvider: "escrow.com",
    escrowId: handoff?.escrowId,
    escrowUrl: handoff?.escrowUrl,
    amount,
    commission,
    status: handoff ? "escrow_started" : "initiated",
    statusTimeline: [
      { status: "initiated", label: "GetThe created the transaction record.", at: now },
      handoff
        ? {
            status: "escrow_started" as const,
            label: handoff.mode === "api" ? "Escrow.com API transaction created." : "Buyer is handed off to Escrow.com.",
            at: now
          }
        : {
            status: "initiated" as const,
            label: `Escrow.com handoff failed and needs admin recovery: ${handoffError?.message ?? "unknown error"}`,
            at: now
          }
    ],
    transferChecklist: [
      {
        label: "Buyer funds Escrow.com transaction",
        done: false,
        owner: "buyer",
        dueAt: addDays(new Date(), 2).toISOString()
      },
      {
        label: "Seller unlocks domain and obtains transfer code",
        done: false,
        owner: "seller",
        dueAt: addDays(new Date(), 4).toISOString()
      },
      {
        label: "Buyer confirms registrar transfer",
        done: false,
        owner: "buyer",
        dueAt: addDays(new Date(), 7).toISOString()
      },
      {
        label: "GetThe records transfer verification",
        done: false,
        owner: "admin",
        dueAt: addDays(new Date(), 8).toISOString()
      },
      {
        label: "Escrow.com releases seller payout",
        done: false,
        owner: "escrow",
        dueAt: addDays(new Date(), 10).toISOString()
      }
    ]
  };

  if (!isDatabaseConfigured()) {
    localTransactions.unshift({
      transaction,
      listing,
      sellerEmail,
      createdAt: now,
      updatedAt: now
    });
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
      escrowId: handoff?.escrowId,
      escrowUrl: handoff?.escrowUrl,
      amountCents: dollarsToCents(amount),
      commissionCents: dollarsToCents(commission),
      status: handoff ? "ESCROW_STARTED" : "INITIATED",
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

export async function retryTransactionEscrowHandoff(input: { transactionId: string; actorEmail?: string; note?: string }) {
  if (!isDatabaseConfigured()) {
    return {
      action: "transaction_handoff_retry",
      transactionId: input.transactionId,
      recovered: true,
      mode: "local"
    };
  }

  const prisma = getPrisma();
  const transaction = await prisma.transaction.findFirst({
    where: {
      OR: [{ id: input.transactionId }, { escrowId: input.transactionId }]
    },
    include: transactionInclude()
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  const listing = mapListing(transaction.listing);
  const amount = centsToDollars(transaction.amountCents);
  const handoff = await createEscrowHandoff({
    listing,
    buyerEmail: transaction.buyer.email,
    sellerEmail: `${listing.seller.slug}@seller.getthe.com`,
    amount
  });
  const timeline = Array.isArray(transaction.statusTimeline)
    ? (transaction.statusTimeline as Transaction["statusTimeline"])
    : [];
  const now = new Date().toISOString();
  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      escrowId: handoff.escrowId,
      escrowUrl: handoff.escrowUrl,
      status: "ESCROW_STARTED",
      statusTimeline: [
        ...timeline,
        {
          status: "escrow_started",
          label: handoff.mode === "api"
            ? "Admin recreated Escrow.com API transaction."
            : "Admin recreated Escrow.com handoff link.",
          at: now
        }
      ] as Prisma.InputJsonValue,
      updatedAt: new Date()
    },
    include: transactionInclude()
  });
  const actor = input.actorEmail ? await ensureUser(input.actorEmail, "ADMIN") : null;

  await prisma.auditEvent.create({
    data: {
      actorId: actor?.id,
      eventType: "escrow.handoff.retried",
      entityType: "transaction",
      entityId: transaction.id,
      metadata: {
        oldEscrowId: transaction.escrowId,
        newEscrowId: handoff.escrowId,
        note: input.note,
        retriedAt: now
      } as Prisma.InputJsonValue
    }
  });

  return {
    action: "transaction_handoff_retry",
    recovered: true,
    transaction: mapTransaction(updated),
    mode: "database"
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

export async function processPortfolioImport(csv: string, options: { sellerEmail?: string; actorEmail?: string } = {}) {
  const rows = parsePortfolioCsv(csv);
  const sellerEmail = (options.sellerEmail ?? "seller@getthe.com").toLowerCase();
  const acceptedCandidates = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.domain && isValidDomain(row.domain) && (row.price ?? 0) >= 500);
  const needsReview = rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => !acceptedCandidates.some((candidate) => candidate.index === index))
    .map(({ row }) => ({
      ...row,
      reason: !row.domain || !isValidDomain(row.domain) ? "invalid_domain" : "below_mid_tier_floor_or_missing_price"
    }));
  const createdByIndex = new Map<number, DomainListing>();
  const creationFailures: Array<Record<string, unknown>> = [];

  for (const { row, index } of acceptedCandidates) {
    try {
      const listing = await createListingDraft({
        domain: row.domain,
        price: row.price ?? 500,
        minimumOffer: row.minimumOffer,
        registrar: row.registrar,
        category: row.category ?? "Imported",
        sellerEmail
      });
      createdByIndex.set(index, listing);
    } catch (error) {
      creationFailures.push({
        ...row,
        reason: error instanceof Error && /unique|duplicate/i.test(error.message) ? "duplicate_domain" : "create_failed",
        detail: error instanceof Error ? error.message : "Listing creation failed."
      });
    }
  }

  if (isDatabaseConfigured()) {
    const seller = await ensureUser(sellerEmail, "SELLER");
    const prisma = getPrisma();
    await prisma.sellerProfile.update({
      where: { userId: seller.id },
      data: {
        importedPortfolioMeta: {
          lastImportedAt: new Date().toISOString(),
          source: "csv",
          totalRows: rows.length,
          accepted: createdByIndex.size,
          needsReview: needsReview.length + creationFailures.length
        }
      }
    });
    await prisma.auditEvent.create({
      data: {
        actorId: seller.id,
        eventType: "portfolio.import.processed",
        entityType: "seller_profile",
        entityId: seller.id,
        metadata: {
          sellerEmail,
          totalRows: rows.length,
          accepted: createdByIndex.size,
          needsReview: needsReview.length + creationFailures.length,
          actorEmail: options.actorEmail ?? sellerEmail
        }
      }
    });
  }

  const accepted = acceptedCandidates
    .filter(({ index }) => createdByIndex.has(index))
    .map(({ row, index }) => ({
      ...row,
      listingId: createdByIndex.get(index)?.id,
      sellerEmail,
      status: "pending_verification",
      ownershipVerification: "dns_txt"
    }));

  return {
    summary: {
      total: rows.length,
      accepted: accepted.length,
      needsReview: needsReview.length + creationFailures.length
    },
    accepted,
    review: [...needsReview, ...creationFailures]
  };
}

export async function getSellerProfilePage(slug: string): Promise<SellerProfilePage | null> {
  const normalizedSlug = slug.toLowerCase();

  if (!isDatabaseConfigured()) {
    const listings = getLocalListings()
      .filter((listing) => listing.seller.slug === normalizedSlug)
      .filter((listing) => listing.status !== "archived" && listing.status !== "sold");
    const seller = listings[0]?.seller;

    return seller ? buildSellerProfilePage(seller, listings) : null;
  }

  const prisma = getPrisma();
  const profile = await prisma.sellerProfile.findUnique({
    where: { slug: normalizedSlug },
    include: { user: true }
  });

  if (!profile) {
    return null;
  }

  const [rows, completedTransactions] = await Promise.all([
    prisma.domainListing.findMany({
      where: {
        sellerId: profile.userId,
        status: {
          notIn: [PrismaListingStatus.ARCHIVED, PrismaListingStatus.SOLD]
        }
      },
      include: listingInclude(),
      orderBy: { updatedAt: "desc" },
      take: 48
    }),
    prisma.transaction.count({
      where: {
        sellerId: profile.userId,
        status: {
          in: [PrismaTransactionStatus.PAYOUT_COMPLETE, PrismaTransactionStatus.CLOSED]
        }
      }
    })
  ]);

  return buildSellerProfilePage(
    {
      id: profile.id,
      publicName: profile.publicName,
      slug: profile.slug,
      verified: profile.user.twoFactorEnabled,
      transactionCount: completedTransactions,
      avgResponseHours: 6
    },
    rows.map(mapListing)
  );
}

export async function createParkedInquiry(input: {
  listingId: string;
  name: string;
  email: string;
  message: string;
  budget?: number;
}): Promise<ParkedInquiry> {
  const listing = await getMarketplaceListing(input.listingId);
  if (!listing) {
    throw new Error("Listing not found.");
  }

  const now = new Date().toISOString();
  const sellerEmail = await getSellerEmailForListing(listing);
  const inquiry: ParkedInquiry = {
    id: `inq_${Date.now()}`,
    listingId: listing.id,
    domain: listing.domain,
    sellerEmail,
    name: input.name.trim(),
    email: input.email.toLowerCase(),
    message: input.message.trim(),
    budget: input.budget,
    status: "new",
    updatedAt: now,
    createdAt: now
  };

  if (!isDatabaseConfigured()) {
    localParkedInquiries.unshift(inquiry);
    return inquiry;
  }

  await getPrisma().auditEvent.create({
    data: {
      eventType: "parking.inquiry.created",
      entityType: "domain_listing",
      entityId: listing.id,
      metadata: inquiry as unknown as Prisma.InputJsonValue
    }
  });

  return inquiry;
}

export async function listParkedInquiries(input: {
  email: string;
  role: "seller" | "admin";
  status?: ParkedInquiry["status"] | "all";
  q?: string;
}): Promise<ParkedInquiry[]> {
  const status = input.status && input.status !== "all" ? input.status : undefined;
  const q = input.q?.trim().toLowerCase();
  const email = input.email.toLowerCase();

  if (!isDatabaseConfigured()) {
    return localParkedInquiries
      .filter((inquiry) => input.role === "admin" || inquiry.sellerEmail.toLowerCase() === email)
      .filter((inquiry) => !status || inquiry.status === status)
      .filter((inquiry) => !q || inquiryMatchesQuery(inquiry, q))
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }

  const events = await getPrisma().auditEvent.findMany({
    where: {
      eventType: {
        in: ["parking.inquiry.created", "parking.inquiry.followup.updated"]
      }
    },
    orderBy: { createdAt: "asc" },
    take: 500
  });
  const inquiries = mergeInquiryAuditEvents(events.map((event) => ({
    eventType: event.eventType,
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString()
  })));

  return inquiries
    .filter((inquiry) => input.role === "admin" || inquiry.sellerEmail.toLowerCase() === email)
    .filter((inquiry) => !status || inquiry.status === status)
    .filter((inquiry) => !q || inquiryMatchesQuery(inquiry, q))
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
}

export async function updateParkedInquiry(input: {
  inquiryId: string;
  actorEmail: string;
  actorRole: "seller" | "admin";
  status: ParkedInquiry["status"];
  followUpNote?: string;
}) {
  const existing = (await listParkedInquiries({ email: input.actorEmail, role: input.actorRole, status: "all" }))
    .find((inquiry) => inquiry.id === input.inquiryId);
  if (!existing) {
    throw new Error("Inquiry not found.");
  }

  const updated: ParkedInquiry = {
    ...existing,
    status: input.status,
    followUpNote: input.followUpNote ?? existing.followUpNote,
    updatedAt: new Date().toISOString()
  };

  if (!isDatabaseConfigured()) {
    const index = localParkedInquiries.findIndex((inquiry) => inquiry.id === input.inquiryId);
    if (index >= 0) {
      localParkedInquiries[index] = updated;
    }
    return {
      action: "parking_inquiry_update",
      inquiry: updated,
      mode: "local"
    };
  }

  const actor = await ensureUser(input.actorEmail, input.actorRole === "admin" ? "ADMIN" : "SELLER");
  await getPrisma().auditEvent.create({
    data: {
      actorId: actor.id,
      eventType: "parking.inquiry.followup.updated",
      entityType: "domain_listing",
      entityId: existing.listingId,
      metadata: {
        inquiryId: input.inquiryId,
        status: input.status,
        followUpNote: input.followUpNote,
        actorEmail: input.actorEmail,
        updatedAt: updated.updatedAt
      } as Prisma.InputJsonValue
    }
  });

  return {
    action: "parking_inquiry_update",
    inquiry: updated,
    mode: "database"
  };
}

export async function listTransactionDashboard(input: {
  email: string;
  role: "buyer" | "seller" | "admin";
  party?: "all" | "buyer" | "seller";
  status?: TransactionStatus | "all";
  q?: string;
}): Promise<TransactionDashboardItem[]> {
  const party = input.party ?? "all";
  const status = input.status && input.status !== "all" ? input.status : undefined;
  const q = input.q?.trim().toLowerCase();

  if (!isDatabaseConfigured()) {
    const email = input.email.toLowerCase();
    return localTransactions
      .filter((record) => {
        if (input.role === "buyer" && record.transaction.buyerEmail.toLowerCase() !== email) return false;
        if (
          input.role === "seller" &&
          !isLocalDefaultSellerEmail(email) &&
          record.sellerEmail.toLowerCase() !== email
        ) {
          return false;
        }
        if (status && record.transaction.status !== status) return false;
        if (!q) return true;
        return [
          record.listing.domain,
          record.transaction.buyerEmail,
          record.sellerEmail,
          record.transaction.escrowId ?? ""
        ].some((value) => value.toLowerCase().includes(q));
      })
      .filter((record) => {
        if (input.role !== "admin" || party === "all" || !q) return true;
        return party === "buyer"
          ? record.transaction.buyerEmail.toLowerCase().includes(q)
          : record.sellerEmail.toLowerCase().includes(q);
      })
      .map((record) => mapLocalTransactionDashboardItem(record));
  }

  const where: Prisma.TransactionWhereInput = {};
  if (status) {
    where.status = mapTransactionStatusToPrisma(status);
  }

  if (input.role === "buyer") {
    where.buyer = { email: input.email.toLowerCase() };
  } else if (input.role === "seller") {
    where.listing = { seller: { email: input.email.toLowerCase() } };
  }

  if (q) {
    const qFilters =
      input.role === "admin" && party === "buyer"
        ? [{ buyer: { email: { contains: q, mode: "insensitive" as const } } }]
        : input.role === "admin" && party === "seller"
          ? [{ listing: { seller: { email: { contains: q, mode: "insensitive" as const } } } }]
          : [
              { listing: { domain: { contains: q, mode: "insensitive" as const } } },
              { buyer: { email: { contains: q, mode: "insensitive" as const } } },
              { escrowId: { contains: q, mode: "insensitive" as const } }
            ];
    where.AND = [{ OR: qFilters }];
  }

  const rows = await getPrisma().transaction.findMany({
    where,
    include: transactionInclude(),
    orderBy: { updatedAt: "desc" },
    take: 50
  });

  return rows.map(mapTransactionDashboardItem);
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
    const existing = localWatchlistItems.find(
      (item) => item.userEmail.toLowerCase() === input.userEmail.toLowerCase() && item.listingId === listing.id
    );
    if (existing) {
      return existing;
    }

    const item = {
      id: `watch_${Date.now()}`,
      userEmail: input.userEmail.toLowerCase(),
      listingId: listing.id,
      domain: listing.domain,
      createdAt
    };
    localWatchlistItems.unshift(item);
    return { ...item };
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

export async function listWatchlistItems(input: { userEmail: string }): Promise<WatchlistItem[]> {
  if (!isDatabaseConfigured()) {
    return localWatchlistItems
      .filter((item) => item.userEmail.toLowerCase() === input.userEmail.toLowerCase())
      .map((item) => ({ ...item }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const rows = await getPrisma().watchlist.findMany({
    where: {
      user: {
        email: input.userEmail.toLowerCase()
      }
    },
    include: {
      user: true,
      listing: true
    },
    orderBy: { createdAt: "desc" }
  });

  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user.email,
    listingId: row.listingId,
    domain: row.listing.domain,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function deleteWatchlistItem(input: { id: string; userEmail: string }) {
  if (!isDatabaseConfigured()) {
    const index = localWatchlistItems.findIndex(
      (item) => item.id === input.id && item.userEmail.toLowerCase() === input.userEmail.toLowerCase()
    );
    if (index >= 0) {
      localWatchlistItems.splice(index, 1);
    }

    return {
      action: "watchlist_delete",
      id: input.id,
      deleted: index >= 0,
      mode: "local"
    };
  }

  const row = await getPrisma().watchlist.findFirst({
    where: {
      id: input.id,
      user: {
        email: input.userEmail.toLowerCase()
      }
    }
  });

  if (!row) {
    throw new Error("Watchlist item not found.");
  }

  await getPrisma().watchlist.delete({ where: { id: row.id } });
  return {
    action: "watchlist_delete",
    id: row.id,
    deleted: true,
    mode: "database"
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
    const alert = {
      id: `alert_${Date.now()}`,
      userEmail: input.userEmail,
      name: input.name,
      filters: input.filters,
      cadence: input.cadence,
      active: true,
      createdAt
    };
    localSearchAlerts.unshift(alert);
    return { ...alert };
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

export async function listSearchAlerts(input: { userEmail: string }): Promise<SearchAlertItem[]> {
  if (!isDatabaseConfigured()) {
    return localSearchAlerts
      .filter((alert) => alert.userEmail.toLowerCase() === input.userEmail.toLowerCase())
      .map((alert) => ({ ...alert }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const rows = await getPrisma().searchAlert.findMany({
    where: {
      user: {
        email: input.userEmail.toLowerCase()
      }
    },
    include: {
      user: true
    },
    orderBy: { updatedAt: "desc" }
  });

  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user.email,
    name: row.name,
    filters: row.filters as DomainFilters,
    cadence: row.cadence as SearchAlertItem["cadence"],
    active: row.active,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function updateSearchAlert(input: {
  id: string;
  userEmail: string;
  name?: string;
  cadence?: SearchAlertItem["cadence"];
  active?: boolean;
}) {
  if (!isDatabaseConfigured()) {
    const alert = localSearchAlerts.find(
      (item) => item.id === input.id && item.userEmail.toLowerCase() === input.userEmail.toLowerCase()
    );
    if (!alert) {
      throw new Error("Search alert not found.");
    }

    alert.name = input.name ?? alert.name;
    alert.cadence = input.cadence ?? alert.cadence;
    alert.active = input.active ?? alert.active;
    return { ...alert };
  }

  const existing = await getPrisma().searchAlert.findFirst({
    where: {
      id: input.id,
      user: {
        email: input.userEmail.toLowerCase()
      }
    },
    include: { user: true }
  });

  if (!existing) {
    throw new Error("Search alert not found.");
  }

  const row = await getPrisma().searchAlert.update({
    where: { id: existing.id },
    data: {
      name: input.name ?? existing.name,
      cadence: input.cadence ?? existing.cadence,
      active: input.active ?? existing.active
    },
    include: { user: true }
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

export async function deleteSearchAlert(input: { id: string; userEmail: string }) {
  if (!isDatabaseConfigured()) {
    const index = localSearchAlerts.findIndex(
      (item) => item.id === input.id && item.userEmail.toLowerCase() === input.userEmail.toLowerCase()
    );
    if (index >= 0) {
      localSearchAlerts.splice(index, 1);
    }

    return {
      action: "search_alert_delete",
      id: input.id,
      deleted: index >= 0,
      mode: "local"
    };
  }

  const row = await getPrisma().searchAlert.findFirst({
    where: {
      id: input.id,
      user: {
        email: input.userEmail.toLowerCase()
      }
    }
  });

  if (!row) {
    throw new Error("Search alert not found.");
  }

  await getPrisma().searchAlert.delete({ where: { id: row.id } });
  return {
    action: "search_alert_delete",
    id: row.id,
    deleted: true,
    mode: "database"
  };
}

export async function getNotificationPreferences(email: string): Promise<NotificationPreferences> {
  const normalizedEmail = email.toLowerCase();
  if (!isDatabaseConfigured()) {
    return {
      ...defaultNotificationPreferences,
      ...(localNotificationPreferences.get(normalizedEmail) ?? {})
    };
  }

  const user = (await getPrisma().user.findUnique({ where: { email: normalizedEmail } })) ?? await ensureUser(normalizedEmail, "BUYER");
  return normalizeNotificationPreferences(user.notificationPreferences);
}

export async function updateNotificationPreferences(input: {
  email: string;
  preferences: Partial<NotificationPreferences>;
}): Promise<NotificationPreferences> {
  const email = input.email.toLowerCase();
  const preferences = normalizeNotificationPreferences(input.preferences);
  if (!isDatabaseConfigured()) {
    localNotificationPreferences.set(email, preferences);
    return preferences;
  }

  const user = (await getPrisma().user.findUnique({ where: { email } })) ?? await ensureUser(email, "BUYER");
  const row = await getPrisma().user.update({
    where: { id: user.id },
    data: {
      notificationPreferences: preferences as unknown as Prisma.InputJsonValue
    }
  });

  return normalizeNotificationPreferences(row.notificationPreferences);
}

export async function deliverSearchAlerts(input: {
  cadence?: SearchAlertItem["cadence"];
  actorEmail?: string;
} = {}) {
  const cadence = input.cadence ?? "weekly";
  const alerts = await listSearchAlertsForDelivery(cadence);
  const deliveries = [];

  for (const alert of alerts) {
    const preferences = await getNotificationPreferences(alert.userEmail);
    if (!shouldDeliverAlert(preferences, alert.cadence)) {
      deliveries.push({
        alertId: alert.id,
        userEmail: alert.userEmail,
        delivered: false,
        reason: "disabled"
      });
      continue;
    }

    const search = await searchMarketplaceListings(alert.filters, { page: 1, limit: 5 });
    if (!search.results.length) {
      deliveries.push({
        alertId: alert.id,
        userEmail: alert.userEmail,
        delivered: false,
        reason: "no_matches"
      });
      continue;
    }

    const topMatches = search.results.map((listing) => listing.domain).join(", ");
    const result = await sendMarketplaceNotification({
      to: alert.userEmail,
      subject: `GetThe alert: ${alert.name}`,
      textBody: `${search.pagination.total} matching domains found. Top matches: ${topMatches}.`,
      tag: `search-alert-${alert.cadence}`,
      entityType: "search_alert",
      entityId: alert.id,
      recipientRole: "buyer",
      metadata: {
        cadence: alert.cadence,
        matchCount: search.pagination.total,
        actorEmail: input.actorEmail
      }
    });

    deliveries.push({
      alertId: alert.id,
      userEmail: alert.userEmail,
      delivered: result.ok,
      reason: result.ok ? "sent" : "failed",
      matchCount: search.pagination.total
    });
  }

  return {
    cadence,
    scanned: alerts.length,
    delivered: deliveries.filter((delivery) => delivery.delivered).length,
    deliveries
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

export async function listModerationQueue(): Promise<AdminQueueItem[]> {
  if (!isDatabaseConfigured()) {
    return adminQueue;
  }

  const rows = await getPrisma().auditEvent.findMany({
    where: {
      OR: [
        { eventType: "moderation.flag.created", entityType: "admin_queue_item" },
        { eventType: { startsWith: "admin.review." }, entityType: "admin_queue_item" }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 250
  });

  const flags = new Map<string, AdminQueueItem>();
  const reviews = new Map<string, { status: AdminQueueItem["status"]; createdAt: Date }>();

  for (const row of rows) {
    if (row.eventType === "moderation.flag.created") {
      const item = normalizeAdminQueueItem(row.metadata, row.entityId, row.createdAt);
      if (!flags.has(item.id)) {
        flags.set(item.id, item);
      }
      continue;
    }

    const status: AdminQueueItem["status"] =
      row.eventType === "admin.review.approve" || row.eventType === "admin.review.reject" ? "resolved" : "reviewing";
    const existing = reviews.get(row.entityId);
    if (!existing || existing.createdAt < row.createdAt) {
      reviews.set(row.entityId, { status, createdAt: row.createdAt });
    }
  }

  return Array.from(flags.values())
    .map((item) => ({
      ...item,
      status: reviews.get(item.id)?.status ?? item.status
    }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.createdAt.localeCompare(a.createdAt));
}

export async function recordAnalyticsEvent(input: {
  eventType:
    | "analytics.appraisal.completed"
    | "analytics.search.performed"
    | "analytics.listing.viewed"
    | "analytics.parking.viewed"
    | "analytics.ai.buyers_suggested";
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured()) {
    return {
      recorded: false,
      mode: "local"
    };
  }

  await getPrisma().auditEvent.create({
    data: {
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue
    }
  });

  return {
    recorded: true,
    mode: "database"
  };
}

export async function getOperationalAnalytics(): Promise<OperationalAnalytics> {
  if (!isDatabaseConfigured()) {
    const listings = getLocalListings().filter((listing) => listing.status === "active");
    return {
      appraisalCount: listings.length,
      listingCount: listings.length,
      appraisalToListingRate: 100,
      searchCount: 0,
      detailViewCount: 0,
      searchToDetailRate: 0,
      offerCount: localOffers.length,
      offerRate: 0,
      escrowStartedCount: 0,
      escrowStartRate: 0,
      completedGmv: 0,
      failedHandoffCount: 0
    };
  }

  const prisma = getPrisma();
  const [
    appraisalCount,
    listingCount,
    searchCount,
    detailViewCount,
    offerCount,
    escrowStartedCount,
    completedTransactions,
    failedHandoffCount
  ] = await Promise.all([
    prisma.auditEvent.count({ where: { eventType: "analytics.appraisal.completed" } }),
    prisma.domainListing.count({ where: { status: "ACTIVE" } }),
    prisma.auditEvent.count({ where: { eventType: "analytics.search.performed" } }),
    prisma.auditEvent.count({ where: { eventType: "analytics.listing.viewed" } }),
    prisma.offer.count(),
    prisma.transaction.count({
      where: {
        status: {
          in: [
            PrismaTransactionStatus.ESCROW_STARTED,
            PrismaTransactionStatus.BUYER_FUNDED,
            PrismaTransactionStatus.DOMAIN_TRANSFER_STARTED,
            PrismaTransactionStatus.TRANSFER_VERIFIED,
            PrismaTransactionStatus.PAYOUT_COMPLETE,
            PrismaTransactionStatus.CLOSED
          ]
        }
      }
    }),
    prisma.transaction.findMany({
      where: {
        status: {
          in: [PrismaTransactionStatus.PAYOUT_COMPLETE, PrismaTransactionStatus.CLOSED]
        }
      },
      select: { amountCents: true }
    }),
    prisma.auditEvent.count({ where: { eventType: "escrow.handoff.failed" } })
  ]);

  return {
    appraisalCount,
    listingCount,
    appraisalToListingRate: rate(listingCount, appraisalCount),
    searchCount,
    detailViewCount,
    searchToDetailRate: rate(detailViewCount, searchCount),
    offerCount,
    offerRate: rate(offerCount, detailViewCount),
    escrowStartedCount,
    escrowStartRate: rate(escrowStartedCount, offerCount),
    completedGmv: centsToDollars(completedTransactions.reduce((sum, transaction) => sum + transaction.amountCents, 0)),
    failedHandoffCount
  };
}

export async function getAdminOverview(filters: AdminOperationFilters = {}) {
  const activeListings = await listMarketplaceListings();
  const supportCases = await listSupportCases();
  const operations = await getAdminOperations(filters);
  const queue = await listModerationQueue();
  const gmv = activeListings.reduce((sum, listing) => sum + listing.price, 0);
  const commission = Math.round(gmv * COMMISSION_RATE);

  return {
    activeListings,
    gmv,
    commission,
    queue,
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

  assertListingTransition(
    listing.status.toLowerCase() as Parameters<typeof assertListingTransition>[0],
    input.status
  );
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

// First-class admin seeding flow for the report's "seed 50-100 domains" mandate:
// bulk-create + auto-appraise (via processPortfolioImport) -> ownership-attest ->
// activate, in one call. House inventory is owned by the operator, so ownership is
// admin-attested (recorded in the activation audit note) rather than DNS-challenged;
// the attestation method is captured so a real verifyOwnershipChallenge can be
// swapped in for third-party consignment later.
export async function seedInventoryBatch(
  csv: string,
  options: {
    sellerEmail?: string;
    actorEmail?: string;
    autoActivate?: boolean;
    ownershipMethod?: "dns_txt" | "nameserver" | "registrar" | "manual";
  } = {}
) {
  const ownershipMethod = options.ownershipMethod ?? "manual";
  const importResult = await processPortfolioImport(csv, {
    sellerEmail: options.sellerEmail,
    actorEmail: options.actorEmail
  });

  const autoActivate = options.autoActivate ?? true;
  const activated: Array<{ listingId: string; domain: string }> = [];
  const activationFailures: Array<{ listingId?: string; domain: string; reason: string }> = [];

  if (autoActivate) {
    for (const item of importResult.accepted) {
      if (!item.listingId) {
        activationFailures.push({ domain: item.domain, reason: "missing_listing_id" });
        continue;
      }
      try {
        await adminUpdateListingStatus({
          listingId: item.listingId,
          status: "active",
          actorEmail: options.actorEmail ?? options.sellerEmail,
          note: `Seeded house inventory; ownership ${ownershipMethod}-attested by admin.`
        });
        activated.push({ listingId: item.listingId, domain: item.domain });
      } catch (error) {
        activationFailures.push({
          listingId: item.listingId,
          domain: item.domain,
          reason: error instanceof Error ? error.message : "activation_failed"
        });
      }
    }
  }

  return {
    summary: {
      ...importResult.summary,
      activated: activated.length,
      activationFailures: activationFailures.length,
      ownershipMethod
    },
    accepted: importResult.accepted,
    activated,
    review: importResult.review,
    activationFailures
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
  checklistUpdates?: Array<{
    index: number;
    done?: boolean;
    owner?: NonNullable<Transaction["transferChecklist"][number]["owner"]>;
    dueAt?: string;
    note?: string;
  }>;
  note?: string;
}) {
  if (!isDatabaseConfigured()) {
    const record = localTransactions.find(
      (item) => item.transaction.id === input.transactionId || item.transaction.escrowId === input.transactionId
    );
    if (record) {
      if (input.status) {
        record.transaction.status = input.status;
        record.transaction.statusTimeline.push({
          status: input.status,
          label: input.note ?? `Admin updated transaction ${input.status}.`,
          at: new Date().toISOString()
        });
      }
      if (input.checklistUpdates?.length) {
        record.transaction.transferChecklist = record.transaction.transferChecklist.map((item, index) => {
          const update = input.checklistUpdates?.find((candidate) => candidate.index === index);
          return update ? mergeChecklistItem(item, update) : item;
        });
      }
      record.updatedAt = new Date().toISOString();
    }

    return {
      action: "transaction_operations",
      transaction: record?.transaction,
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
    return update ? mergeChecklistItem(item as Transaction["transferChecklist"][number], update) : item;
  });
  if (input.status) {
    assertTransactionTransition(
      existing.status.toLowerCase() as Parameters<typeof assertTransactionTransition>[0],
      input.status
    );
  }
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

async function listSearchAlertsForDelivery(cadence: SearchAlertItem["cadence"]) {
  if (!isDatabaseConfigured()) {
    return localSearchAlerts.filter((alert) => alert.active && alert.cadence === cadence);
  }

  const rows = await getPrisma().searchAlert.findMany({
    where: {
      active: true,
      cadence
    },
    include: {
      user: true
    },
    orderBy: { updatedAt: "asc" },
    take: 100
  });

  return rows.map((row) => ({
    id: row.id,
    userEmail: row.user.email,
    name: row.name,
    filters: row.filters as DomainFilters,
    cadence: row.cadence as SearchAlertItem["cadence"],
    active: row.active,
    createdAt: row.createdAt.toISOString()
  }));
}

export type { AdminQueueItem };
export type { AdminEntityDetail, AdminOperationFilters } from "@/lib/repository/internal/admin";
