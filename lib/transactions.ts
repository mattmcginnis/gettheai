import { COMMISSION_RATE } from "@/lib/constants";
import { getListing } from "@/lib/search";
import { listings } from "@/lib/seed";
import type {
  ListingStatus,
  Offer,
  Transaction,
  TransactionStatus,
  VerificationTier
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Status state machines
//
// These are the single source of truth for which status transitions are legal
// for offers, transactions, and listings. They are enforced in app code at
// every mutation site (see lib/repository.ts) because Postgres CHECK
// constraints cannot reference a row's previous value without triggers. The
// DB migration that accompanies this file enforces the *static* invariants the
// state machine cannot (value ranges, expiry ordering, one live offer per
// buyer per listing).
//
// A transition to the same status is always allowed (idempotent no-op) so that
// callers updating sibling fields — e.g. a transaction's checklist without a
// status change — are not rejected.
// ---------------------------------------------------------------------------

export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export const OFFER_STATUS_TRANSITIONS: TransitionMap<Offer["status"]> = {
  pending: ["countered", "accepted", "rejected", "expired", "canceled"],
  countered: ["countered", "accepted", "rejected", "expired", "canceled"],
  accepted: [],
  rejected: [],
  expired: [],
  canceled: []
};

export const TRANSACTION_STATUS_TRANSITIONS: TransitionMap<TransactionStatus> = {
  initiated: ["escrow_started", "canceled", "disputed"],
  escrow_started: ["buyer_funded", "canceled", "disputed"],
  buyer_funded: ["domain_transfer_started", "canceled", "disputed"],
  domain_transfer_started: ["transfer_verified", "canceled", "disputed"],
  transfer_verified: ["payout_complete", "disputed"],
  payout_complete: ["closed", "disputed"],
  closed: ["disputed"],
  canceled: [],
  disputed: ["closed", "canceled", "escrow_started"]
};

export const LISTING_STATUS_TRANSITIONS: TransitionMap<ListingStatus> = {
  draft: ["pending_verification", "active", "archived"],
  pending_verification: ["active", "flagged", "archived", "draft"],
  active: ["flagged", "sold", "archived", "pending_verification"],
  flagged: ["active", "archived"],
  sold: ["archived"],
  archived: ["draft", "active"]
};

export function isValidTransition<S extends string>(
  map: TransitionMap<S>,
  from: S,
  to: S
): boolean {
  if (from === to) {
    return true;
  }
  return map[from]?.includes(to) ?? false;
}

export function assertTransition<S extends string>(
  entity: string,
  map: TransitionMap<S>,
  from: S,
  to: S
): void {
  if (!isValidTransition(map, from, to)) {
    throw new Error(`Invalid ${entity} status transition: ${from} -> ${to}.`);
  }
}

export function assertOfferTransition(from: Offer["status"], to: Offer["status"]): void {
  assertTransition("offer", OFFER_STATUS_TRANSITIONS, from, to);
}

export function assertTransactionTransition(
  from: TransactionStatus,
  to: TransactionStatus
): void {
  assertTransition("transaction", TRANSACTION_STATUS_TRANSITIONS, from, to);
}

export function assertListingTransition(from: ListingStatus, to: ListingStatus): void {
  assertTransition("listing", LISTING_STATUS_TRANSITIONS, from, to);
}

export function requiredVerificationForAmount(amount: number): VerificationTier {
  if (amount >= 15000) {
    return "kyc_review";
  }

  if (amount >= 5000) {
    return "escrow_intent";
  }

  return "two_factor";
}

export function verificationRank(tier: VerificationTier) {
  const ranks: Record<VerificationTier, number> = {
    email: 1,
    two_factor: 2,
    escrow_intent: 3,
    kyc_review: 4
  };
  return ranks[tier];
}

export function canPlaceOffer(amount: number, buyerTier: VerificationTier) {
  const required = requiredVerificationForAmount(amount);
  return {
    allowed: verificationRank(buyerTier) >= verificationRank(required),
    required
  };
}

export function calculateCommission(amount: number) {
  return Math.round(amount * COMMISSION_RATE);
}

export function createEscrowTransaction({
  listingId,
  buyerEmail,
  offerId,
  amount
}: {
  listingId: string;
  buyerEmail: string;
  offerId?: string;
  amount?: number;
}): Transaction {
  const listing = getListing(listingId) ?? getListingById(listingId);

  if (!listing) {
    throw new Error("Listing not found.");
  }

  const finalAmount = amount ?? listing.price;
  const escrowId = `escrow_${listing.domain.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}`;
  const createdAt = new Date().toISOString();

  return {
    id: `txn_${Date.now()}`,
    listingId: listing.id,
    offerId,
    buyerEmail,
    sellerId: listing.seller.id,
    escrowProvider: "escrow.com",
    escrowId,
    escrowUrl: buildEscrowHandoffUrl(escrowId, listing.domain, finalAmount, buyerEmail),
    amount: finalAmount,
    commission: calculateCommission(finalAmount),
    status: "escrow_started",
    statusTimeline: [
      statusEvent("initiated", "GetThe created the transaction record.", createdAt),
      statusEvent("escrow_started", "Buyer is handed off to Escrow.com.", createdAt)
    ],
    transferChecklist: [
      { label: "Buyer funds Escrow.com transaction", done: false, owner: "buyer", dueAt: deadline(2, createdAt) },
      { label: "Seller unlocks domain and obtains transfer code", done: false, owner: "seller", dueAt: deadline(4, createdAt) },
      { label: "Buyer confirms registrar transfer", done: false, owner: "buyer", dueAt: deadline(7, createdAt) },
      { label: "GetThe records transfer verification", done: false, owner: "admin", dueAt: deadline(8, createdAt) },
      { label: "Escrow.com releases seller payout", done: false, owner: "escrow", dueAt: deadline(10, createdAt) }
    ]
  };
}

function getListingById(id: string) {
  return listings.find((listing) => listing.id === id);
}

function statusEvent(status: TransactionStatus, label: string, at: string) {
  return { status, label, at };
}

function deadline(days: number, from: string) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function buildEscrowHandoffUrl(escrowId: string, domain: string, amount: number, buyerEmail: string) {
  const params = new URLSearchParams({
    ref: escrowId,
    domain,
    amount: String(amount),
    buyer: buyerEmail,
    source: "getthe"
  });

  return `https://www.escrow.com/domain-name-holding?${params.toString()}`;
}
