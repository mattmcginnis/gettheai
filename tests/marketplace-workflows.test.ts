import { describe, expect, it } from "vitest";
import {
  createSearchAlert,
  createSupportCase,
  createWatchlistItem,
  listNotificationEvents,
  verifyListingOwnership
} from "@/lib/repository";
import { verifyOwnershipChallenge } from "@/lib/ownership-verification";

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

  it("returns an empty notification feed in local mode", async () => {
    await expect(listNotificationEvents({ recipientEmail: "buyer@example.com" })).resolves.toEqual([]);
  });

  it("keeps manual ownership verification admin-only", async () => {
    await expect(
      verifyOwnershipChallenge({
        domain: "example.com",
        method: "manual",
        actorRole: "seller"
      })
    ).resolves.toMatchObject({
      verified: false,
      reason: "Manual verification requires an admin reviewer."
    });
  });
});
