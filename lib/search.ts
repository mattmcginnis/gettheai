import { listings } from "@/lib/seed";
import type { DomainFilters, DomainListing } from "@/lib/types";

export function searchListings(filters: DomainFilters = {}) {
  return filterAndSortListings(listings, filters);
}

export function filterAndSortListings(allListings: DomainListing[], filters: DomainFilters = {}) {
  const normalizedQuery = filters.q?.trim().toLowerCase();
  let results = allListings.filter((listing) => listing.status === "active");

  if (normalizedQuery) {
    results = results.filter((listing) => {
      const haystack = [
        listing.domain,
        listing.category,
        listing.description,
        ...listing.brandSignals,
        ...listing.appraisal.keywordSignals
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }

  if (filters.tld && filters.tld !== "any") {
    results = results.filter((listing) => listing.tld === filters.tld);
  }

  if (filters.category && filters.category !== "any") {
    results = results.filter((listing) => listing.category === filters.category);
  }

  if (filters.minPrice) {
    results = results.filter((listing) => listing.price >= Number(filters.minPrice));
  }

  if (filters.maxPrice) {
    results = results.filter((listing) => listing.price <= Number(filters.maxPrice));
  }

  if (filters.maxLength) {
    results = results.filter((listing) => listing.domain.split(".")[0].length <= Number(filters.maxLength));
  }

  if (filters.minTraffic) {
    results = results.filter((listing) => listing.trafficMonthly >= Number(filters.minTraffic));
  }

  if (filters.minConfidence) {
    results = results.filter((listing) => listing.appraisal.confidence >= Number(filters.minConfidence));
  }

  if (filters.listingType && filters.listingType !== "any") {
    results = results.filter((listing) => listing.listingType === filters.listingType);
  }

  return sortListings(results, filters.sort ?? "featured");
}

export function getListing(domain: string) {
  return listings.find((listing) => listing.domain === domain.toLowerCase());
}

export function getCategories() {
  return Array.from(new Set(listings.map((listing) => listing.category))).sort();
}

function sortListings(results: DomainListing[], sort: NonNullable<DomainFilters["sort"]>) {
  const sorted = [...results];

  if (sort === "price_asc") {
    return sorted.sort((a, b) => a.price - b.price);
  }

  if (sort === "price_desc") {
    return sorted.sort((a, b) => b.price - a.price);
  }

  if (sort === "newest") {
    return sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  if (sort === "confidence") {
    return sorted.sort((a, b) => b.appraisal.confidence - a.appraisal.confidence);
  }

  return sorted.sort((a, b) => {
    const aScore = a.appraisal.confidence + a.trafficMonthly / 20 + (a.ownershipVerified ? 10 : 0);
    const bScore = b.appraisal.confidence + b.trafficMonthly / 20 + (b.ownershipVerified ? 10 : 0);
    return bScore - aScore;
  });
}
