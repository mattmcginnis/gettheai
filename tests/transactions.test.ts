import { describe, expect, it } from "vitest";
import { calculateCommission, canPlaceOffer, createEscrowTransaction } from "@/lib/transactions";

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
