import { describe, expect, it } from "vitest";
import { listingMatchesFilters, rankBuyersForListing } from "@/lib/buyer-matching";
import { listings } from "@/lib/seed";

// lumenflow.com — tld "com", category "SaaS", status "active".
const listing = listings[0];

describe("buyer matching", () => {
  it("matches a listing to filters via the shared search engine", () => {
    expect(listingMatchesFilters(listing, { tld: "com" })).toBe(true);
    expect(listingMatchesFilters(listing, { category: "SaaS" })).toBe(true);
    expect(listingMatchesFilters(listing, { tld: "ai" })).toBe(false);
  });

  it("scores saved-search alert matches with cadence weighting", () => {
    const ranked = rankBuyersForListing(listing, {
      alerts: [
        { buyerEmail: "Instant@Example.com", filters: { tld: "com" }, cadence: "instant" },
        { buyerEmail: "weekly@example.com", filters: { tld: "com" }, cadence: "weekly" },
        { buyerEmail: "nomatch@example.com", filters: { tld: "ai" }, cadence: "instant" }
      ],
      watches: []
    });

    expect(ranked.map((match) => match.buyerEmail)).toEqual([
      "instant@example.com",
      "weekly@example.com"
    ]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].reasons[0]).toMatch(/Saved-search match/);
  });

  it("ranks a buyer watching the exact domain highest", () => {
    const ranked = rankBuyersForListing(listing, {
      alerts: [{ buyerEmail: "alert@example.com", filters: { tld: "com" }, cadence: "weekly" }],
      watches: [
        { buyerEmail: "watcher@example.com", listingId: listing.id, category: "x", tld: "x", domain: "x.com" }
      ]
    });

    expect(ranked[0].buyerEmail).toBe("watcher@example.com");
    expect(ranked[0].reasons).toContain("Watching this domain");
  });

  it("credits category and tld affinity from other watched domains", () => {
    const ranked = rankBuyersForListing(listing, {
      alerts: [],
      watches: [
        { buyerEmail: "affinity@example.com", listingId: "other-1", category: "SaaS", tld: "com", domain: "otherbrand.com" }
      ]
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(ranked[0].reasons).toEqual(
      expect.arrayContaining(["Watches SaaS domains", "Watches .com domains"])
    );
  });

  it("aggregates multiple signals per buyer and dedupes reasons", () => {
    const ranked = rankBuyersForListing(listing, {
      alerts: [{ buyerEmail: "combo@example.com", filters: { category: "SaaS" }, cadence: "daily" }],
      watches: [
        { buyerEmail: "combo@example.com", listingId: "x", category: "SaaS", tld: "com", domain: "lumenly.com" }
      ]
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].buyerEmail).toBe("combo@example.com");
    // alert (6 + 2 daily) + category (3) + tld (1) = 12
    expect(ranked[0].score).toBeGreaterThanOrEqual(12);
    expect(ranked[0].reasons.length).toBe(new Set(ranked[0].reasons).size);
  });

  it("excludes buyers with no matching signal", () => {
    const ranked = rankBuyersForListing(listing, {
      alerts: [{ buyerEmail: "nope@example.com", filters: { tld: "ai" }, cadence: "instant" }],
      watches: []
    });

    expect(ranked).toHaveLength(0);
  });
});
