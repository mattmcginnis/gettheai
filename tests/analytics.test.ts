import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calculateMarketplaceMetrics } from "@/lib/analytics";
import { getOperationalAnalytics, recordAnalyticsEvent } from "@/lib/repository";
import { listings } from "@/lib/seed";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("marketplace analytics", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("calculates marketplace-level metrics", () => {
    const metrics = calculateMarketplaceMetrics(listings);

    expect(metrics.listingCount).toBe(listings.length);
    expect(metrics.listedGmv).toBeGreaterThan(0);
    expect(metrics.expectedCommission).toBe(Math.round(metrics.listedGmv * 0.07));
    expect(metrics.tldBreakdown.length).toBeGreaterThan(0);
    expect(metrics.topKeywordSignals.length).toBeGreaterThan(0);
  });

  it("returns operational funnel metrics in local mode", async () => {
    const recorded = await recordAnalyticsEvent({
      eventType: "analytics.search.performed",
      entityType: "domain_search",
      entityId: "ai"
    });
    const metrics = await getOperationalAnalytics();

    expect(recorded).toMatchObject({ recorded: false, mode: "local" });
    expect(metrics.listingCount).toBeGreaterThan(0);
    expect(metrics.appraisalToListingRate).toBe(100);
  });
});
