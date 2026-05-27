import { describe, expect, it } from "vitest";
import {
  createSearchAlert,
  createSupportCase,
  createWatchlistItem,
  verifyListingOwnership
} from "@/lib/repository";

describe("marketplace workflow repository fallbacks", () => {
  it("verifies listing ownership in local mode", async () => {
    const result = await verifyListingOwnership({
      listingId: "dom-1",
      method: "manual",
      actorEmail: "seller@getthe.com"
    });

    expect(result.listing.ownershipVerified).toBe(true);
    expect(result.verification.mode).toBe("local");
  });

  it("creates buyer watchlists and alerts in local mode", async () => {
    const watch = await createWatchlistItem({
      userEmail: "buyer@example.com",
      listingId: "dom-1"
    });
    const alert = await createSearchAlert({
      userEmail: "buyer@example.com",
      name: "AI names",
      filters: { q: "ai" },
      cadence: "weekly"
    });

    expect(watch.domain).toBe("atlasforge.com");
    expect(alert.active).toBe(true);
  });

  it("creates support cases with an AI draft in local mode", async () => {
    const supportCase = await createSupportCase({
      requesterEmail: "buyer@example.com",
      subject: "Transfer status",
      context: "Buyer funded escrow and needs the next step."
    });

    expect(supportCase.status).toBe("open");
    expect(supportCase.aiDraftResponses.length).toBe(1);
  });
});
