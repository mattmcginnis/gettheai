import { describe, expect, it } from "vitest";
import { calculateMarketplaceMetrics } from "@/lib/analytics";
import { listings } from "@/lib/seed";

describe("marketplace analytics", () => {
  it("calculates marketplace-level metrics", () => {
    const metrics = calculateMarketplaceMetrics(listings);

    expect(metrics.listingCount).toBe(listings.length);
    expect(metrics.listedGmv).toBeGreaterThan(0);
    expect(metrics.expectedCommission).toBe(Math.round(metrics.listedGmv * 0.07));
    expect(metrics.tldBreakdown.length).toBeGreaterThan(0);
    expect(metrics.topKeywordSignals.length).toBeGreaterThan(0);
  });
});
