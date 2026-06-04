import { COMMISSION_RATE } from "@/lib/constants";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { listings as seedListings } from "@/lib/seed";
import { type AdminOperationFilters, applyAdminOperationFilters } from "@/lib/repository/internal/admin";
import { listingInclude, offerInclude, transactionInclude } from "@/lib/repository/internal/includes";
import { mapVerificationFromPrisma } from "@/lib/repository/internal/mappers";
import { centsToDollars } from "@/lib/repository/internal/utils";
import { listMarketplaceListings } from "@/lib/repository/marketplace";
import { listModerationQueue } from "@/lib/repository/admin-moderation";
import { listSupportCases } from "@/lib/repository/support";

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
