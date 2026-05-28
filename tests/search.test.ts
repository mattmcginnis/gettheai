import { describe, expect, it } from "vitest";
import { escapePostgresLikePattern } from "@/lib/postgres-search";
import { searchListings } from "@/lib/search";

describe("searchListings", () => {
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
});
