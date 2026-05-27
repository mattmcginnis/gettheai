import { describe, expect, it } from "vitest";
import { updateTransactionFromEscrowEvent } from "@/lib/repository";

describe("escrow webhook handling", () => {
  it("maps funded webhook status in local mode", async () => {
    const result = await updateTransactionFromEscrowEvent({
      id: "escrow_demo",
      status: "buyer_funded"
    });

    expect(result.received).toBe(true);
    expect(result.mappedStatus).toBe("buyer_funded");
    expect(result.auditEvent.eventType).toBe("escrow.webhook.received");
  });
});
