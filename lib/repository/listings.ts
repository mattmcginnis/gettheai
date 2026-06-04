import { ListingStatus as PrismaListingStatus, Prisma } from "@prisma/client";
import { appraiseDomain, getTld, isValidDomain, normalizeDomain } from "@/lib/appraisal";
import { COMMISSION_RATE } from "@/lib/constants";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { assertListingTransition } from "@/lib/transactions";
import type { DomainListing, ListingType, Offer, SellerInventoryItem } from "@/lib/types";
import { type PrismaListing, listingInclude } from "@/lib/repository/internal/includes";
import { getLocalListingsForSeller, localAuctionState, localDraftListings, localListingDetailOverrides, localListingStatusOverrides, localOffers, localSellerForEmail } from "@/lib/repository/internal/local-store";
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
  listingType?: ListingType;
  auction?: { endsAt: string; reservePrice?: number; bidIncrement: number };
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

  // Auctions launch live (active) so bids can be placed during the window; other
  // listing types start in pending_verification and go active after ownership
  // verification.
  const isAuction = Boolean(input.auction);
  const listingType: ListingType = isAuction ? "auction" : input.listingType ?? "buy_now_and_offer";
  const startingBid = input.minimumOffer ?? Math.round(input.price * 0.65);

  if (!isDatabaseConfigured()) {
    const localSeller = localSellerForEmail(input.sellerEmail);
    const id = `draft_${cryptoSafeId()}`;
    const draft: LocalDraftListing = {
      id,
      domain,
      tld: getTld(domain),
      status: isAuction ? "active" : "pending_verification",
      price: input.price,
      minimumOffer: startingBid,
      registrar: input.registrar ?? "Unknown",
      seller: localSeller.profile,
      sellerEmail: localSeller.email,
      listingType,
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
      appraisal,
      ...(input.auction
        ? { auctionEndsAt: input.auction.endsAt, bidIncrement: input.auction.bidIncrement }
        : {})
    };

    localDraftListings.unshift(draft);
    if (input.auction) {
      localAuctionState.set(id, {
        reserveCents: input.auction.reservePrice != null ? dollarsToCents(input.auction.reservePrice) : null,
        settledAt: null
      });
    }
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
      status: isAuction ? "ACTIVE" : "PENDING_VERIFICATION",
      listingType: mapListingTypeToPrisma(listingType),
      priceCents: dollarsToCents(input.price),
      minimumOfferCents: dollarsToCents(startingBid),
      commissionBps: 700,
      auctionEndsAt: input.auction ? new Date(input.auction.endsAt) : null,
      reservePriceCents: input.auction?.reservePrice != null ? dollarsToCents(input.auction.reservePrice) : null,
      bidIncrementCents: input.auction ? dollarsToCents(input.auction.bidIncrement) : null,
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

