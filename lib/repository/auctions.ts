import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import {
  assertListingTransition,
  assertOfferTransition,
  canPlaceOffer,
  isAuctionOpen,
  minimumNextBid,
  reserveMet
} from "@/lib/transactions";
import type { AuctionBid, AuctionState, OfferStatus, VerificationTier } from "@/lib/types";
import {
  localAuctionState,
  localListingStatusOverrides,
  localOffers,
  localSellerEmail
} from "@/lib/repository/internal/local-store";
import { mapVerificationToPrisma } from "@/lib/repository/internal/mappers";
import { ensureUser, getPrismaListingByIdOrDomain } from "@/lib/repository/internal/prisma";
import { centsToDollars, cryptoSafeId, dollarsToCents } from "@/lib/repository/internal/utils";
import { getMarketplaceListing } from "@/lib/repository/marketplace";
import { createTransactionRecord } from "@/lib/repository/transactions";

const LIVE_OFFER_STATUSES: OfferStatus[] = ["pending", "countered"];

// A bid is an Offer; this is the minimal shape the auction state machinery needs.
type NormalizedBid = { email: string; amount: number; status: OfferStatus };

function effectiveIncrement(startingBid: number, bidIncrement: number | undefined): number {
  return bidIncrement && bidIncrement > 0 ? bidIncrement : Math.max(100, Math.round(startingBid * 0.05));
}

function computeAuctionState(args: {
  listingId: string;
  domain: string;
  endsAt: string;
  startingBid: number;
  increment: number;
  reserve: number | null;
  settledAt: string | null;
  bids: NormalizedBid[];
}): AuctionState {
  const { listingId, domain, endsAt, startingBid, increment, reserve, settledAt, bids } = args;
  const live = bids
    .filter((bid) => LIVE_OFFER_STATUSES.includes(bid.status))
    .sort((a, b) => b.amount - a.amount);
  const accepted = bids.find((bid) => bid.status === "accepted") ?? null;
  const settled = Boolean(settledAt);
  const top = accepted ?? live[0] ?? null;
  const highestBid = top?.amount ?? null;

  return {
    listingId,
    domain,
    endsAt,
    open: isAuctionOpen(endsAt) && !settled,
    startingBid,
    bidIncrement: increment,
    minimumNextBid: minimumNextBid(settled ? null : live[0]?.amount ?? null, startingBid, increment),
    highestBid,
    highestBidderEmail: top?.email ?? null,
    bidCount: bids.length,
    bidderCount: new Set(bids.map((bid) => bid.email.toLowerCase())).size,
    reserveMet: reserveMet(highestBid, reserve),
    settled,
    winnerEmail: settled ? accepted?.email ?? null : null
  };
}

function assertAuctionListing(listing: { listingType: string } | null, listingId: string) {
  if (!listing) {
    throw new Error(`Listing ${listingId} not found.`);
  }
  if (listing.listingType !== "auction" && listing.listingType !== "AUCTION") {
    const error = new Error("Listing is not an auction.");
    Object.assign(error, { statusCode: 400 });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// placeBid
// ---------------------------------------------------------------------------

export async function placeBid(input: {
  listingId: string;
  buyerEmail: string;
  amount: number;
  buyerVerificationTier: VerificationTier;
}): Promise<{ bid: AuctionBid; auction: AuctionState }> {
  if (!isDatabaseConfigured()) {
    return placeBidLocal(input);
  }
  return placeBidDb(input);
}

async function placeBidLocal(input: {
  listingId: string;
  buyerEmail: string;
  amount: number;
  buyerVerificationTier: VerificationTier;
}): Promise<{ bid: AuctionBid; auction: AuctionState }> {
  const listing = await getMarketplaceListing(input.listingId);
  assertAuctionListing(listing, input.listingId);
  const auctionListing = listing!;
  const endsAt = auctionListing.auctionEndsAt ?? "";

  if (!isAuctionOpen(endsAt)) {
    const error = new Error("Auction has ended.");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  const bids = localOffers.filter((offer) => offer.listingId === auctionListing.id);
  const live = bids.filter((offer) => LIVE_OFFER_STATUSES.includes(offer.status));
  const highest = live.reduce<number | null>((max, offer) => (max == null || offer.amount > max ? offer.amount : max), null);
  const startingBid = auctionListing.minimumOffer;
  const increment = effectiveIncrement(startingBid, auctionListing.bidIncrement);
  const minNext = minimumNextBid(highest, startingBid, increment);

  if (input.amount < minNext) {
    const error = new Error(`Minimum next bid is ${minNext}.`);
    Object.assign(error, { statusCode: 400, minimumNextBid: minNext });
    throw error;
  }

  const verification = canPlaceOffer(input.amount, input.buyerVerificationTier);
  if (!verification.allowed) {
    const error = new Error(`Upgrade buyer verification to ${verification.required} before bidding.`);
    Object.assign(error, { requiredVerificationTier: verification.required, statusCode: 403 });
    throw error;
  }

  const now = new Date().toISOString();
  const buyerEmail = input.buyerEmail.toLowerCase();
  const existing = live.find((offer) => offer.buyerEmail.toLowerCase() === buyerEmail);
  if (existing) {
    existing.amount = input.amount;
    existing.buyerVerificationTier = input.buyerVerificationTier;
    existing.updatedAt = now;
  } else {
    localOffers.unshift({
      id: `bid_${cryptoSafeId()}`,
      domain: auctionListing.domain,
      listingId: auctionListing.id,
      buyerEmail,
      sellerEmail: localSellerEmail(auctionListing),
      sellerName: auctionListing.seller.publicName,
      amount: input.amount,
      status: "pending",
      buyerVerificationTier: input.buyerVerificationTier,
      expiresAt: endsAt,
      updatedAt: now
    });
  }

  return {
    bid: { buyerEmail, amount: input.amount, status: "pending", updatedAt: now },
    auction: await getAuctionState(auctionListing.id)
  };
}

async function placeBidDb(input: {
  listingId: string;
  buyerEmail: string;
  amount: number;
  buyerVerificationTier: VerificationTier;
}): Promise<{ bid: AuctionBid; auction: AuctionState }> {
  const prisma = getPrisma();
  const row = await getPrismaListingByIdOrDomain(input.listingId);
  assertAuctionListing(row, input.listingId);
  const endsAt = row!.auctionEndsAt ? row!.auctionEndsAt.toISOString() : "";

  if (!isAuctionOpen(endsAt)) {
    const error = new Error("Auction has ended.");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  const liveBids = await prisma.offer.findMany({
    where: { listingId: row!.id, status: { in: ["PENDING", "COUNTERED"] } },
    include: { buyer: true }
  });
  const highest = liveBids.reduce<number | null>(
    (max, bid) => (max == null || bid.amountCents > max ? bid.amountCents : max),
    null
  );
  const startingBid = centsToDollars(row!.minimumOfferCents ?? row!.priceCents);
  const increment = effectiveIncrement(startingBid, row!.bidIncrementCents != null ? centsToDollars(row!.bidIncrementCents) : undefined);
  const minNext = minimumNextBid(highest != null ? centsToDollars(highest) : null, startingBid, increment);

  if (input.amount < minNext) {
    const error = new Error(`Minimum next bid is ${minNext}.`);
    Object.assign(error, { statusCode: 400, minimumNextBid: minNext });
    throw error;
  }

  const verification = canPlaceOffer(input.amount, input.buyerVerificationTier);
  if (!verification.allowed) {
    const error = new Error(`Upgrade buyer verification to ${verification.required} before bidding.`);
    Object.assign(error, { requiredVerificationTier: verification.required, statusCode: 403 });
    throw error;
  }

  const buyer = await ensureUser(input.buyerEmail, "BUYER", input.buyerVerificationTier);
  const existing = liveBids.find((bid) => bid.buyerId === buyer.id);
  const historyEntry = {
    actor: "buyer",
    message: existing ? "Raised auction bid." : "Placed auction bid.",
    amount: input.amount,
    at: new Date().toISOString()
  };

  if (existing) {
    const history = Array.isArray(existing.negotiationHistory) ? existing.negotiationHistory : [];
    await prisma.offer.update({
      where: { id: existing.id },
      data: {
        amountCents: dollarsToCents(input.amount),
        buyerVerificationTier: mapVerificationToPrisma(input.buyerVerificationTier),
        negotiationHistory: [...history, historyEntry]
      }
    });
  } else {
    await prisma.offer.create({
      data: {
        listingId: row!.id,
        buyerId: buyer.id,
        amountCents: dollarsToCents(input.amount),
        status: "PENDING",
        buyerVerificationTier: mapVerificationToPrisma(input.buyerVerificationTier),
        expiresAt: row!.auctionEndsAt!,
        negotiationHistory: [historyEntry]
      }
    });
  }

  return {
    bid: { buyerEmail: input.buyerEmail.toLowerCase(), amount: input.amount, status: "pending", updatedAt: new Date().toISOString() },
    auction: await getAuctionState(row!.id)
  };
}

// ---------------------------------------------------------------------------
// getAuctionState (lazily settles a past-end, unsettled auction)
// ---------------------------------------------------------------------------

export async function getAuctionState(listingId: string, now: Date = new Date()): Promise<AuctionState> {
  if (!isDatabaseConfigured()) {
    const listing = await getMarketplaceListing(listingId);
    assertAuctionListing(listing, listingId);
    const auctionListing = listing!;
    const state = localAuctionState.get(auctionListing.id);
    if (!isAuctionOpen(auctionListing.auctionEndsAt ?? "", now) && !state?.settledAt) {
      await settleAuction(auctionListing.id, now);
    }
    return buildLocalAuctionState(auctionListing.id);
  }

  const row = await getPrismaListingByIdOrDomain(listingId);
  assertAuctionListing(row, listingId);
  if (!isAuctionOpen(row!.auctionEndsAt ? row!.auctionEndsAt.toISOString() : "", now) && !row!.auctionSettledAt) {
    await settleAuction(row!.id, now);
  }
  return buildDbAuctionState(row!.id);
}

async function buildLocalAuctionState(listingId: string): Promise<AuctionState> {
  const listing = await getMarketplaceListing(listingId);
  assertAuctionListing(listing, listingId);
  const auctionListing = listing!;
  const state = localAuctionState.get(auctionListing.id);
  const startingBid = auctionListing.minimumOffer;
  return computeAuctionState({
    listingId: auctionListing.id,
    domain: auctionListing.domain,
    endsAt: auctionListing.auctionEndsAt ?? "",
    startingBid,
    increment: effectiveIncrement(startingBid, auctionListing.bidIncrement),
    reserve: state?.reserveCents != null ? centsToDollars(state.reserveCents) : null,
    settledAt: state?.settledAt ?? null,
    bids: localOffers
      .filter((offer) => offer.listingId === auctionListing.id)
      .map((offer) => ({ email: offer.buyerEmail, amount: offer.amount, status: offer.status }))
  });
}

async function buildDbAuctionState(listingId: string): Promise<AuctionState> {
  const prisma = getPrisma();
  const row = await getPrismaListingByIdOrDomain(listingId);
  assertAuctionListing(row, listingId);
  const offers = await prisma.offer.findMany({
    where: { listingId: row!.id },
    include: { buyer: true }
  });
  const startingBid = centsToDollars(row!.minimumOfferCents ?? row!.priceCents);
  return computeAuctionState({
    listingId: row!.id,
    domain: row!.domain,
    endsAt: row!.auctionEndsAt ? row!.auctionEndsAt.toISOString() : "",
    startingBid,
    increment: effectiveIncrement(startingBid, row!.bidIncrementCents != null ? centsToDollars(row!.bidIncrementCents) : undefined),
    reserve: row!.reservePriceCents != null ? centsToDollars(row!.reservePriceCents) : null,
    settledAt: row!.auctionSettledAt ? row!.auctionSettledAt.toISOString() : null,
    bids: offers.map((offer) => ({
      email: offer.buyer.email,
      amount: centsToDollars(offer.amountCents),
      status: offer.status.toLowerCase() as OfferStatus
    }))
  });
}

// ---------------------------------------------------------------------------
// settleAuction (idempotent)
// ---------------------------------------------------------------------------

export async function settleAuction(listingId: string, now: Date = new Date()): Promise<AuctionState> {
  if (!isDatabaseConfigured()) {
    return settleAuctionLocal(listingId, now);
  }
  return settleAuctionDb(listingId, now);
}

async function settleAuctionLocal(listingId: string, now: Date): Promise<AuctionState> {
  const listing = await getMarketplaceListing(listingId);
  assertAuctionListing(listing, listingId);
  const auctionListing = listing!;
  const config = localAuctionState.get(auctionListing.id) ?? { reserveCents: null, settledAt: null };

  // Idempotent, and a no-op while the auction is still open.
  if (config.settledAt || isAuctionOpen(auctionListing.auctionEndsAt ?? "", now)) {
    return buildLocalAuctionState(auctionListing.id);
  }

  const live = localOffers
    .filter((offer) => offer.listingId === auctionListing.id && LIVE_OFFER_STATUSES.includes(offer.status))
    .sort((a, b) => b.amount - a.amount);
  const winner = live[0] ?? null;
  const reserve = config.reserveCents != null ? centsToDollars(config.reserveCents) : null;
  const settledAtIso = new Date().toISOString();

  if (winner && reserveMet(winner.amount, reserve)) {
    winner.status = "accepted";
    winner.updatedAt = settledAtIso;
    for (const offer of live.slice(1)) {
      offer.status = "expired";
      offer.updatedAt = settledAtIso;
    }
    localListingStatusOverrides.set(auctionListing.id, "sold");
    await createTransactionRecord({
      listingId: auctionListing.id,
      buyerEmail: winner.buyerEmail,
      amount: winner.amount
    });
  } else {
    for (const offer of live) {
      offer.status = "expired";
      offer.updatedAt = settledAtIso;
    }
  }

  localAuctionState.set(auctionListing.id, { reserveCents: config.reserveCents, settledAt: settledAtIso });
  return buildLocalAuctionState(auctionListing.id);
}

async function settleAuctionDb(listingId: string, now: Date): Promise<AuctionState> {
  const prisma = getPrisma();
  const row = await getPrismaListingByIdOrDomain(listingId);
  assertAuctionListing(row, listingId);

  if (row!.auctionSettledAt || isAuctionOpen(row!.auctionEndsAt ? row!.auctionEndsAt.toISOString() : "", now)) {
    return buildDbAuctionState(row!.id);
  }

  const live = await prisma.offer.findMany({
    where: { listingId: row!.id, status: { in: ["PENDING", "COUNTERED"] } },
    include: { buyer: true },
    orderBy: { amountCents: "desc" }
  });
  const winner = live[0] ?? null;
  const reserve = row!.reservePriceCents != null ? centsToDollars(row!.reservePriceCents) : null;
  const winnerAmount = winner ? centsToDollars(winner.amountCents) : null;

  if (winner && reserveMet(winnerAmount, reserve)) {
    assertOfferTransition(winner.status.toLowerCase() as OfferStatus, "accepted");
    assertListingTransition(row!.status.toLowerCase() as "active", "sold");
    await prisma.$transaction([
      prisma.offer.update({ where: { id: winner.id }, data: { status: "ACCEPTED" } }),
      prisma.offer.updateMany({
        where: { listingId: row!.id, status: { in: ["PENDING", "COUNTERED"] }, id: { not: winner.id } },
        data: { status: "EXPIRED" }
      }),
      prisma.domainListing.update({
        where: { id: row!.id },
        data: { status: "SOLD", auctionSettledAt: new Date() }
      })
    ]);
    await createTransactionRecord({
      listingId: row!.id,
      buyerEmail: winner.buyer.email,
      offerId: winner.id,
      amount: winnerAmount ?? undefined
    });
  } else {
    await prisma.$transaction([
      prisma.offer.updateMany({
        where: { listingId: row!.id, status: { in: ["PENDING", "COUNTERED"] } },
        data: { status: "EXPIRED" }
      }),
      prisma.domainListing.update({ where: { id: row!.id }, data: { auctionSettledAt: new Date() } })
    ]);
  }

  return buildDbAuctionState(row!.id);
}

// ---------------------------------------------------------------------------
// settleDueAuctions (cron sweep) + bid history
// ---------------------------------------------------------------------------

export async function settleDueAuctions(): Promise<{ settled: number }> {
  if (!isDatabaseConfigured()) {
    const due = new Set<string>();
    for (const offer of localOffers) {
      due.add(offer.listingId);
    }
    let settled = 0;
    for (const listingId of due) {
      const listing = await getMarketplaceListing(listingId);
      if (
        listing &&
        listing.listingType === "auction" &&
        !isAuctionOpen(listing.auctionEndsAt ?? "") &&
        !localAuctionState.get(listingId)?.settledAt
      ) {
        await settleAuction(listingId);
        settled += 1;
      }
    }
    return { settled };
  }

  const rows = await getPrisma().domainListing.findMany({
    where: {
      listingType: "AUCTION",
      status: "ACTIVE",
      auctionSettledAt: null,
      auctionEndsAt: { lte: new Date() }
    },
    select: { id: true },
    take: 100
  });
  for (const row of rows) {
    await settleAuction(row.id);
  }
  return { settled: rows.length };
}

export async function listAuctionBids(listingId: string): Promise<AuctionBid[]> {
  if (!isDatabaseConfigured()) {
    return localOffers
      .filter((offer) => offer.listingId === listingId)
      .map((offer) => ({ buyerEmail: offer.buyerEmail, amount: offer.amount, status: offer.status, updatedAt: offer.updatedAt }))
      .sort((a, b) => b.amount - a.amount);
  }

  const offers = await getPrisma().offer.findMany({
    where: { listing: { OR: [{ id: listingId }, { domain: listingId }] } },
    include: { buyer: true },
    orderBy: { amountCents: "desc" }
  });
  return offers.map((offer) => ({
    buyerEmail: offer.buyer.email,
    amount: centsToDollars(offer.amountCents),
    status: offer.status.toLowerCase() as OfferStatus,
    updatedAt: offer.updatedAt.toISOString()
  }));
}
