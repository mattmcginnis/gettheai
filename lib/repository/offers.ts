import { addDays } from "date-fns";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { assertOfferTransition, canPlaceOffer } from "@/lib/transactions";
import type { Offer, OfferInboxItem, VerificationTier } from "@/lib/types";
import { offerInclude } from "@/lib/repository/internal/includes";
import { localOffers, localSellerEmail } from "@/lib/repository/internal/local-store";
import { mapOffer, mapOfferInbox, mapVerificationToPrisma } from "@/lib/repository/internal/mappers";
import { ensureUser, getPrismaListingByIdOrDomain, getPrismaOfferById } from "@/lib/repository/internal/prisma";
import { centsToDollars, dollarsToCents } from "@/lib/repository/internal/utils";
import { getMarketplaceListing } from "@/lib/repository/marketplace";
import { createTransactionRecord } from "@/lib/repository/transactions";

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

