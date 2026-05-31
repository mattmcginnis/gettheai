import { describe, expect, it } from "vitest";
import {
  assertListingTransition,
  assertOfferTransition,
  assertTransactionTransition,
  calculateCommission,
  canPlaceOffer,
  createEscrowTransaction,
  isValidTransition,
  LISTING_STATUS_TRANSITIONS,
  OFFER_STATUS_TRANSITIONS
} from "@/lib/transactions";

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
