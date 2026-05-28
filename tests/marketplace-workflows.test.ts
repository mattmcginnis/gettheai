import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOfferRecord,
  createSearchAlert,
  createSupportCase,
  createWatchlistItem,
  deleteSearchAlert,
  deleteWatchlistItem,
  deliverSearchAlerts,
  getNotificationPreferences,
  listOfferInbox,
  listNotificationEvents,
  listSearchAlerts,
  listSellerInventory,
  listWatchlistItems,
  updateSearchAlert,
  updateNotificationPreferences,
  verifyListingOwnership
} from "@/lib/repository";
import { verifyOwnershipChallenge } from "@/lib/ownership-verification";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostmarkToken = process.env.POSTMARK_SERVER_TOKEN;

describe("marketplace workflow repository fallbacks", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTMARK_SERVER_TOKEN;
  });

  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }

    if (originalPostmarkToken) {
      process.env.POSTMARK_SERVER_TOKEN = originalPostmarkToken;
    } else {
      delete process.env.POSTMARK_SERVER_TOKEN;
    }
  });

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
      userEmail: "buyer-watch@example.com",
      listingId: "dom-1"
    });
    const alert = await createSearchAlert({
      userEmail: "buyer-watch@example.com",
      name: "AI names",
      filters: { q: "ai" },
      cadence: "weekly"
    });
    const savedWatchlist = await listWatchlistItems({ userEmail: "buyer-watch@example.com" });
    const savedAlerts = await listSearchAlerts({ userEmail: "buyer-watch@example.com" });
    const updatedAlert = await updateSearchAlert({
      id: alert.id,
      userEmail: "buyer-watch@example.com",
      active: false
    });
    const deletedWatch = await deleteWatchlistItem({ id: watch.id, userEmail: "buyer-watch@example.com" });
    const deletedAlert = await deleteSearchAlert({ id: alert.id, userEmail: "buyer-watch@example.com" });

    expect(watch.domain).toBe("atlasforge.com");
    expect(alert.active).toBe(true);
    expect(savedWatchlist.length).toBe(1);
    expect(savedAlerts.length).toBe(1);
    expect(updatedAlert.active).toBe(false);
    expect(deletedWatch.deleted).toBe(true);
    expect(deletedAlert.deleted).toBe(true);
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

  it("lists seller inventory and offer inbox records in local mode", async () => {
    const offer = await createOfferRecord({
      listingId: "dom-1",
      buyerEmail: "buyer@example.com",
      amount: 7000,
      buyerVerificationTier: "escrow_intent"
    });
    const inventory = await listSellerInventory({ email: "seller@example.com", role: "seller" });
    const buyerInbox = await listOfferInbox({ email: "buyer@example.com", role: "buyer" });
    const sellerInbox = await listOfferInbox({ email: "seller@example.com", role: "seller" });

    expect(inventory.length).toBeGreaterThan(0);
    expect(buyerInbox.some((item) => item.id === offer.id)).toBe(true);
    expect(sellerInbox.some((item) => item.id === offer.id)).toBe(true);
  });

  it("updates preferences and delivers saved-search alerts in local mode", async () => {
    await createSearchAlert({
      userEmail: "buyer-alerts@example.com",
      name: "AI names",
      filters: { q: "ai" },
      cadence: "weekly"
    });
    const preferences = await updateNotificationPreferences({
      email: "buyer-alerts@example.com",
      preferences: { weeklyDigest: true, instantAlerts: false }
    });
    const delivery = await deliverSearchAlerts({ cadence: "weekly" });

    await expect(getNotificationPreferences("buyer-alerts@example.com")).resolves.toMatchObject(preferences);
    expect(delivery.scanned).toBeGreaterThan(0);
    expect(delivery.delivered).toBeGreaterThan(0);
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
