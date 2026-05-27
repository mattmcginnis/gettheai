import type { DomainListing } from "@/lib/types";

export interface MarketplaceMetrics {
  listingCount: number;
  listedGmv: number;
  expectedCommission: number;
  averagePrice: number;
  medianPrice: number;
  appraisalConfidenceAverage: number;
  verifiedListingRate: number;
  tldBreakdown: Array<{
    tld: string;
    count: number;
    gmv: number;
    averagePrice: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    count: number;
    gmv: number;
  }>;
  topKeywordSignals: Array<{
    keyword: string;
    count: number;
  }>;
}

export function calculateMarketplaceMetrics(listings: DomainListing[]): MarketplaceMetrics {
  const prices = listings.map((listing) => listing.price).sort((a, b) => a - b);
  const listedGmv = listings.reduce((sum, listing) => sum + listing.price, 0);
  const confidenceTotal = listings.reduce((sum, listing) => sum + listing.appraisal.confidence, 0);
  const verifiedCount = listings.filter((listing) => listing.ownershipVerified).length;

  return {
    listingCount: listings.length,
    listedGmv,
    expectedCommission: Math.round(listedGmv * 0.07),
    averagePrice: listings.length ? Math.round(listedGmv / listings.length) : 0,
    medianPrice: median(prices),
    appraisalConfidenceAverage: listings.length ? Math.round(confidenceTotal / listings.length) : 0,
    verifiedListingRate: listings.length ? Math.round((verifiedCount / listings.length) * 100) : 0,
    tldBreakdown: breakdownBy(listings, "tld"),
    categoryBreakdown: breakdownBy(listings, "category"),
    topKeywordSignals: topKeywords(listings)
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  if (values.length % 2) return values[middle];
  return Math.round((values[middle - 1] + values[middle]) / 2);
}

function breakdownBy(listings: DomainListing[], field: "tld" | "category") {
  const grouped = new Map<string, { count: number; gmv: number }>();

  for (const listing of listings) {
    const key = listing[field];
    const current = grouped.get(key) ?? { count: 0, gmv: 0 };
    grouped.set(key, {
      count: current.count + 1,
      gmv: current.gmv + listing.price
    });
  }

  return Array.from(grouped.entries())
    .map(([key, value]) => ({
      [field]: key,
      count: value.count,
      gmv: value.gmv,
      averagePrice: Math.round(value.gmv / value.count)
    }))
    .sort((a, b) => b.gmv - a.gmv) as Array<{
    tld: string;
    category: string;
    count: number;
    gmv: number;
    averagePrice: number;
  }>;
}

function topKeywords(listings: DomainListing[]) {
  const counts = new Map<string, number>();

  for (const listing of listings) {
    for (const keyword of listing.appraisal.keywordSignals) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, 10);
}
