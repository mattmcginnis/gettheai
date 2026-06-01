import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";
import { searchPostgresListingIds, searchPostgresListings } from "@/lib/postgres-search";
import { canQuerySearchIndex, searchIndexedListingIds } from "@/lib/search-index";
import { filterAndSortListings, getListing as getSeedListing } from "@/lib/search";
import type { DomainFacets, DomainFilters, DomainListing, DomainSearchResult } from "@/lib/types";
import { listingInclude } from "@/lib/repository/internal/includes";
import {
  applyLocalListingOverride,
  getLocalListings
} from "@/lib/repository/internal/local-store";
import { mapListing } from "@/lib/repository/internal/mappers";
import { getPrismaListingByIdOrDomain } from "@/lib/repository/internal/prisma";
import { defaultSearchLimit, maxSearchLimit } from "@/lib/repository/internal/utils";

export async function listMarketplaceListings(filters: DomainFilters = {}) {
  if (!isDatabaseConfigured()) {
    return filterAndSortListings(getLocalListings(), filters);
  }

  const prisma = getPrisma();
  if (canQuerySearchIndex()) {
    const indexedIds = await searchIndexedListingIds(filters).catch(() => null);
    if (indexedIds) {
      if (!indexedIds.length) {
        return [];
      }

      const rows = await prisma.domainListing.findMany({
        where: {
          id: {
            in: indexedIds
          }
        },
        include: listingInclude()
      });
      const mapped = rows.map(mapListing);
      const position = new Map(indexedIds.map((id, index) => [id, index]));
      return mapped.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
    }
  }

  return hydrateListingsInOrder(await searchPostgresListingIds(prisma, filters));
}

export async function searchMarketplaceListings(
  filters: DomainFilters = {},
  options: { page?: number; limit?: number } = {}
): Promise<DomainSearchResult> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(maxSearchLimit, Math.max(1, Math.trunc(options.limit ?? defaultSearchLimit)));

  if (!isDatabaseConfigured()) {
    const allResults = filterAndSortListings(getLocalListings(), filters);
    return {
      results: allResults.slice((page - 1) * limit, page * limit),
      filters,
      pagination: buildPagination(page, limit, allResults.length),
      facets: buildLocalFacets(allResults)
    };
  }

  const prisma = getPrisma();
  if (canQuerySearchIndex()) {
    const indexedIds = await searchIndexedListingIds(filters).catch(() => null);
    if (indexedIds) {
      const pagedIds = indexedIds.slice((page - 1) * limit, page * limit);
      const allListings = await hydrateListingsInOrder(indexedIds);
      return {
        results: await hydrateListingsInOrder(pagedIds),
        filters,
        pagination: buildPagination(page, limit, indexedIds.length),
        facets: buildLocalFacets(allListings)
      };
    }
  }

  const search = await searchPostgresListings(prisma, filters, { page, limit });
  return {
    results: await hydrateListingsInOrder(search.ids),
    filters,
    pagination: buildPagination(page, limit, search.total),
    facets: search.facets
  };
}

async function hydrateListingsInOrder(ids: string[]) {
  if (!ids.length) {
    return [];
  }

  const rows = await getPrisma().domainListing.findMany({
    where: {
      id: {
        in: ids
      }
    },
    include: listingInclude()
  });
  const mapped = rows.map(mapListing);
  const position = new Map(ids.map((id, index) => [id, index]));
  return mapped.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
}

export async function listAllMarketplaceListingsForIndexing() {
  if (!isDatabaseConfigured()) {
    return filterAndSortListings(getLocalListings());
  }

  const prisma = getPrisma();
  const rows = await prisma.domainListing.findMany({
    where: { status: "ACTIVE" },
    include: listingInclude(),
    orderBy: { updatedAt: "desc" }
  });

  return rows.map(mapListing);
}

function buildPagination(page: number, limit: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  return {
    page: currentPage,
    limit,
    total,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1
  };
}

function buildLocalFacets(results: DomainListing[]): DomainFacets {
  return {
    tlds: countFacet(results.map((listing) => listing.tld), (value) => `.${value}`),
    categories: countFacet(results.map((listing) => listing.category)),
    listingTypes: countFacet(results.map((listing) => listing.listingType), (value) => value.replaceAll("_", " ")),
    priceBands: [
      { value: "under_5k", label: "Under $5K", count: results.filter((listing) => listing.price < 5000).length },
      { value: "5k_10k", label: "$5K-$10K", count: results.filter((listing) => listing.price >= 5000 && listing.price < 10000).length },
      { value: "10k_25k", label: "$10K-$25K", count: results.filter((listing) => listing.price >= 10000 && listing.price < 25000).length },
      { value: "25k_plus", label: "$25K+", count: results.filter((listing) => listing.price >= 25000).length }
    ]
  };
}

function countFacet(values: string[], labelFor: (value: string) => string = (value) => value) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: labelFor(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function getMarketplaceListing(identifier: string) {
  if (!isDatabaseConfigured()) {
    const normalizedIdentifier = identifier.toLowerCase();
    const localDraft = getLocalListings().find(
      (listing) => listing.id === identifier || listing.domain === normalizedIdentifier
    );

    return localDraft ?? applyLocalListingOverride(getSeedListing(identifier)) ?? null;
  }

  const row = await getPrismaListingByIdOrDomain(identifier);
  return row ? mapListing(row) : null;
}

export async function getFeaturedListings(limit = 3) {
  const active = await listMarketplaceListings({ sort: "featured" });
  return active.slice(0, limit);
}
