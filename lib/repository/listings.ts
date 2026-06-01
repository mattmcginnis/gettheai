import { ListingStatus as PrismaListingStatus, Prisma } from "@prisma/client";
import { appraiseDomain, getTld, isValidDomain, normalizeDomain } from "@/lib/appraisal";
import { COMMISSION_RATE } from "@/lib/constants";
import { parsePortfolioCsv } from "@/lib/imports";
import { type OwnershipVerificationMethod, verifyOwnershipChallenge } from "@/lib/ownership-verification";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { assertListingTransition } from "@/lib/transactions";
import type { DomainListing, ListingType, Offer, SellerInventoryItem } from "@/lib/types";
import { type PrismaListing, listingInclude } from "@/lib/repository/internal/includes";
import { getLocalListingsForSeller, localDraftListings, localListingDetailOverrides, localListingStatusOverrides, localOffers, localSellerForEmail } from "@/lib/repository/internal/local-store";
import { mapAppraisalToCreate, mapListing, mapListingStatusToPrisma, mapListingTypeToPrisma } from "@/lib/repository/internal/mappers";
import { createAdminAudit, ensureUser, getPrismaListingByIdOrDomain } from "@/lib/repository/internal/prisma";
import type { LocalDraftListing } from "@/lib/repository/internal/types";
import { centsToDollars, cryptoSafeId, dollarsToCents, isListingOwnershipVerified, isOpenOfferStatus, ownershipVerificationStatus } from "@/lib/repository/internal/utils";
import { getMarketplaceListing } from "@/lib/repository/marketplace";

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

