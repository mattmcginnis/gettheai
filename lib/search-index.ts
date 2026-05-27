import type { DomainListing } from "@/lib/types";

export type SearchIndexProvider = "local" | "meilisearch" | "typesense";

export interface SearchIndexResult {
  provider: SearchIndexProvider;
  indexed: number;
  indexName: string;
  mode: "remote" | "local";
}

export function getSearchIndexProvider(): SearchIndexProvider {
  if (process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_API_KEY) {
    return "meilisearch";
  }

  if (process.env.TYPESENSE_HOST && process.env.TYPESENSE_API_KEY) {
    return "typesense";
  }

  return "local";
}

export async function indexListings(listings: DomainListing[]): Promise<SearchIndexResult> {
  const provider = getSearchIndexProvider();
  const indexName = process.env.SEARCH_INDEX_NAME ?? "domain_listings";

  if (provider === "meilisearch") {
    await indexMeilisearch(indexName, listings);
    return { provider, indexed: listings.length, indexName, mode: "remote" };
  }

  if (provider === "typesense") {
    await indexTypesense(indexName, listings);
    return { provider, indexed: listings.length, indexName, mode: "remote" };
  }

  return { provider: "local", indexed: listings.length, indexName, mode: "local" };
}

function toSearchDocument(listing: DomainListing) {
  return {
    id: listing.id,
    domain: listing.domain,
    tld: listing.tld,
    price: listing.price,
    minimumOffer: listing.minimumOffer,
    category: listing.category,
    listingType: listing.listingType,
    trafficMonthly: listing.trafficMonthly,
    domainAgeYears: listing.domainAgeYears,
    appraisalConfidence: listing.appraisal.confidence,
    lowEstimate: listing.appraisal.lowEstimate,
    highEstimate: listing.appraisal.highEstimate,
    sellerName: listing.seller.publicName,
    brandSignals: listing.brandSignals,
    keywordSignals: listing.appraisal.keywordSignals,
    description: listing.description,
    createdAt: listing.createdAt
  };
}

async function indexMeilisearch(indexName: string, listings: DomainListing[]) {
  const host = process.env.MEILISEARCH_HOST?.replace(/\/$/, "");
  const key = process.env.MEILISEARCH_API_KEY;
  const response = await fetch(`${host}/indexes/${indexName}/documents?primaryKey=id`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(listings.map(toSearchDocument))
  });

  if (!response.ok) {
    throw new Error(`Meilisearch indexing failed: ${response.status}`);
  }
}

async function indexTypesense(collection: string, listings: DomainListing[]) {
  const host = process.env.TYPESENSE_HOST?.replace(/\/$/, "");
  const key = process.env.TYPESENSE_API_KEY;
  const ensureResponse = await fetch(`${host}/collections`, {
    method: "POST",
    headers: {
      "x-typesense-api-key": key ?? "",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name: collection,
      fields: [
        { name: "domain", type: "string" },
        { name: "tld", type: "string", facet: true },
        { name: "category", type: "string", facet: true },
        { name: "price", type: "int32", facet: true },
        { name: "appraisalConfidence", type: "int32", facet: true },
        { name: "description", type: "string" }
      ],
      default_sorting_field: "appraisalConfidence"
    })
  });

  if (!ensureResponse.ok && ensureResponse.status !== 409) {
    throw new Error(`Typesense collection creation failed: ${ensureResponse.status}`);
  }

  const response = await fetch(`${host}/collections/${collection}/documents/import?action=upsert`, {
    method: "POST",
    headers: {
      "x-typesense-api-key": key ?? "",
      "content-type": "text/plain"
    },
    body: listings.map((listing) => JSON.stringify(toSearchDocument(listing))).join("\n")
  });

  if (!response.ok) {
    throw new Error(`Typesense indexing failed: ${response.status}`);
  }
}
