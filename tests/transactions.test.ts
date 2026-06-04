import { describe, expect, it } from "vitest";
import {
  assertListingTransition,
  assertOfferTransition,
  assertTransactionTransition,
  calculateCommission,
  canPlaceOffer,
  createEscrowTransaction,
  isAuctionOpen,
  isValidTransition,
  LISTING_STATUS_TRANSITIONS,
  minimumNextBid,
  OFFER_STATUS_TRANSITIONS,
  reserveMet
} from "@/lib/transactions";

describe("auction helpers", () => {
  it("isAuctionOpen reflects the end time", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isAuctionOpen(future)).toBe(true);
    expect(isAuctionOpen(past)).toBe(false);
    expect(isAuctionOpen(null)).toBe(false);
    expect(isAuctionOpen(undefined)).toBe(false);
  });

  it("minimumNextBid uses starting bid first, then increment above the high bid", () => {
    expect(minimumNextBid(null, 500, 100)).toBe(500);
    expect(minimumNextBid(600, 500, 100)).toBe(700);
  });

  it("reserveMet treats a null reserve as always met once any bid exists", () => {
    expect(reserveMet(null, 1000)).toBe(false);
    expect(reserveMet(900, 1000)).toBe(false);
    expect(reserveMet(1000, 1000)).toBe(true);
    expect(reserveMet(800, null)).toBe(true);
  });
});

describe("transactions", () => {
  it("calculates 7 percent commission", () => {
    expect(calculateCommission(10000)).toBe(700);
  });

  it("gates high-value offers by verification tier", () => {
    const result = canPlaceOffer(16000, "two_factor");

    expect(result.allowed).toBe(false);
    expect(result.required).toBe("kyc_review");
  });

  it("creates an Escrow.com handoff transaction", () => {
    const transaction = createEscrowTransaction({
      listingId: "dom-1",
      buyerEmail: "buyer@example.com"
    });

    expect(transaction.escrowProvider).toBe("escrow.com");
    expect(transaction.escrowUrl).toContain("escrow.com");
    expect(transaction.commission).toBeGreaterThan(0);
    expect(transaction.transferChecklist[0]).toMatchObject({ owner: "buyer" });
    expect(transaction.transferChecklist[0].dueAt).toBeTruthy();
  });
});

describe("status state machines", () => {
  it("treats an identical status as an idempotent no-op", () => {
    expect(isValidTransition(OFFER_STATUS_TRANSITIONS, "accepted", "accepted")).toBe(true);
    expect(() => assertTransactionTransition("closed", "closed")).not.toThrow();
  });

  it("allows legal offer transitions and rejects illegal ones", () => {
    expect(() => assertOfferTransition("pending", "accepted")).not.toThrow();
    expect(() => assertOfferTransition("countered", "rejected")).not.toThrow();
    expect(() => assertOfferTransition("accepted", "pending")).toThrow(/Invalid offer status transition/);
    expect(() => assertOfferTransition("rejected", "accepted")).toThrow(/Invalid offer status transition/);
  });

  it("enforces the transaction happy path and blocks skips/reversals", () => {
    expect(() => assertTransactionTransition("initiated", "escrow_started")).not.toThrow();
    expect(() => assertTransactionTransition("buyer_funded", "domain_transfer_started")).not.toThrow();
    expect(() => assertTransactionTransition("payout_complete", "closed")).not.toThrow();
    expect(() => assertTransactionTransition("escrow_started", "payout_complete")).toThrow(
      /Invalid transaction status transition/
    );
    expect(() => assertTransactionTransition("closed", "buyer_funded")).toThrow(
      /Invalid transaction status transition/
    );
  });

  it("permits disputes from any active stage", () => {
    expect(() => assertTransactionTransition("buyer_funded", "disputed")).not.toThrow();
    expect(() => assertTransactionTransition("disputed", "closed")).not.toThrow();
  });

  it("guards listing transitions", () => {
    expect(() => assertListingTransition("draft", "active")).not.toThrow();
    expect(() => assertListingTransition("active", "sold")).not.toThrow();
    expect(() => assertListingTransition("sold", "active")).toThrow(/Invalid listing status transition/);
    expect(isValidTransition(LISTING_STATUS_TRANSITIONS, "archived", "active")).toBe(true);
  });
});
