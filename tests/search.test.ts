import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchMarketplaceListings } from "@/lib/repository";
import { escapePostgresLikePattern } from "@/lib/postgres-search";
import { searchListings } from "@/lib/search";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("searchListings", () => {
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

  it("filters by tld and price", () => {
    const results = searchListings({ tld: "org", maxPrice: 6000 });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((listing) => listing.tld === "org")).toBe(true);
    expect(results.every((listing) => listing.price <= 6000)).toBe(true);
  });

  it("matches keyword signals", () => {
    const results = searchListings({ q: "agent" });

    expect(results.some((listing) => listing.domain === "agentforge.ai")).toBe(true);
  });

  it("escapes postgres LIKE wildcards for literal search", () => {
    expect(escapePostgresLikePattern("agent_%\\")).toBe("agent\\_\\%\\\\");
  });

  it("returns paginated marketplace search metadata and facets", async () => {
    const search = await searchMarketplaceListings({ q: "ai" }, { page: 1, limit: 1 });

    expect(search.results).toHaveLength(1);
    expect(search.pagination.total).toBeGreaterThan(1);
    expect(search.pagination.totalPages).toBeGreaterThan(1);
    expect(search.facets.tlds.length).toBeGreaterThan(0);
  });
});
