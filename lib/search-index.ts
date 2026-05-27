import type { DomainListing } from "@/lib/types";
import type { DomainFilters } from "@/lib/types";

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

export function canQuerySearchIndex() {
  return getSearchIndexProvider() !== "local";
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

export async function searchIndexedListingIds(filters: DomainFilters = {}) {
  const provider = getSearchIndexProvider();
  const indexName = process.env.SEARCH_INDEX_NAME ?? "domain_listings";

  if (provider === "meilisearch") {
    return searchMeilisearch(indexName, filters);
  }

  return null;
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
    labelLength: listing.domain.split(".")[0].length,
    createdAt: listing.createdAt,
    createdAtUnix: Math.floor(Date.parse(listing.createdAt) / 1000)
  };
}

async function indexMeilisearch(indexName: string, listings: DomainListing[]) {
  const host = process.env.MEILISEARCH_HOST?.replace(/\/$/, "");
  const key = process.env.MEILISEARCH_API_KEY;
  const settingsTask = await fetch(`${host}/indexes/${indexName}/settings`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      searchableAttributes: ["domain", "description", "category", "brandSignals", "keywordSignals", "sellerName"],
      filterableAttributes: [
        "tld",
        "category",
        "listingType",
        "price",
        "trafficMonthly",
        "appraisalConfidence",
        "labelLength"
      ],
      sortableAttributes: ["price", "createdAtUnix", "appraisalConfidence", "trafficMonthly"]
    })
  });

  if (!settingsTask.ok) {
    throw new Error(`Meilisearch settings update failed: ${settingsTask.status}`);
  }

  await waitForMeiliTask(host, key, await settingsTask.json());

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

  await waitForMeiliTask(host, key, await response.json());
}

async function searchMeilisearch(indexName: string, filters: DomainFilters) {
  const host = process.env.MEILISEARCH_HOST?.replace(/\/$/, "");
  const key = process.env.MEILISEARCH_API_KEY;
  const response = await fetch(`${host}/indexes/${indexName}/search`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      q: filters.q?.trim() || "",
      limit: 100,
      filter: buildMeiliFilter(filters),
      sort: buildMeiliSort(filters.sort)
    })
  });

  if (!response.ok) {
    throw new Error(`Meilisearch query failed: ${response.status}`);
  }

  const payload = (await response.json()) as { hits?: Array<{ id?: unknown }> };
  return payload.hits?.map((hit) => String(hit.id)).filter(Boolean) ?? [];
}

function buildMeiliFilter(filters: DomainFilters) {
  const clauses: string[] = [];

  if (filters.tld && filters.tld !== "any") clauses.push(`tld = ${quoteFilter(filters.tld)}`);
  if (filters.category && filters.category !== "any") clauses.push(`category = ${quoteFilter(filters.category)}`);
  if (filters.listingType && filters.listingType !== "any") clauses.push(`listingType = ${quoteFilter(filters.listingType)}`);
  if (filters.minPrice) clauses.push(`price >= ${Number(filters.minPrice)}`);
  if (filters.maxPrice) clauses.push(`price <= ${Number(filters.maxPrice)}`);
  if (filters.minTraffic) clauses.push(`trafficMonthly >= ${Number(filters.minTraffic)}`);
  if (filters.minConfidence) clauses.push(`appraisalConfidence >= ${Number(filters.minConfidence)}`);
  if (filters.maxLength) clauses.push(`labelLength <= ${Number(filters.maxLength)}`);

  return clauses.length ? clauses.join(" AND ") : undefined;
}

function buildMeiliSort(sort: DomainFilters["sort"]) {
  if (sort === "price_asc") return ["price:asc"];
  if (sort === "price_desc") return ["price:desc"];
  if (sort === "newest") return ["createdAtUnix:desc"];
  if (sort === "confidence") return ["appraisalConfidence:desc"];
  return ["appraisalConfidence:desc", "trafficMonthly:desc"];
}

function quoteFilter(value: string) {
  return JSON.stringify(value);
}

async function waitForMeiliTask(host: string | undefined, key: string | undefined, payload: { taskUid?: unknown }) {
  const taskUid = payload.taskUid;
  if (!host || !key || typeof taskUid === "undefined") {
    return;
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${host}/tasks/${taskUid}`, {
      headers: {
        authorization: `Bearer ${key}`
      }
    });
    const task = (await response.json().catch(() => ({}))) as { status?: string; error?: { message?: string } };
    if (task.status === "succeeded") {
      return;
    }
    if (task.status === "failed") {
      throw new Error(task.error?.message ?? `Meilisearch task ${taskUid} failed.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
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
