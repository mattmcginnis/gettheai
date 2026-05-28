import type { Metadata } from "next";
import Link from "next/link";
import { DomainCard } from "@/components/domain-card";
import { SearchForm } from "@/components/search-form";
import { searchMarketplaceListings } from "@/lib/repository";
import type { DomainFacetValue, DomainFilters } from "@/lib/types";

export const metadata: Metadata = {
  title: "Search Domains",
  alternates: {
    canonical: "https://getthe.com/domains"
  }
};

export default async function DomainsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = toFilters(params);
  const search = await searchMarketplaceListings(filters, {
    page: numberOf(params.page) ?? 1,
    limit: numberOf(params.limit) ?? 12
  });

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <h1 className="text-4xl font-bold">Domain search</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-ink/66">
            Filter verified listings by TLD, price, category, buyer fit, AI confidence,
            and seller transaction readiness.
          </p>
          <div className="mt-6">
            <SearchForm defaultValues={params} />
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="shell">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink/62">
                {search.pagination.total} active listings · page {search.pagination.page} of {search.pagination.totalPages}
              </p>
              <h2 className="mt-1 text-2xl font-bold">Marketplace inventory</h2>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="grid content-start gap-4 rounded-md border border-line bg-white p-4 shadow-panel">
              <FacetGroup title="TLD" items={search.facets.tlds} params={params} paramName="tld" />
              <FacetGroup title="Category" items={search.facets.categories} params={params} paramName="category" />
              <FacetGroup title="Listing type" items={search.facets.listingTypes} params={params} paramName="listingType" />
              <FacetGroup
                title="Price"
                items={search.facets.priceBands}
                params={params}
                toPatch={(item) => priceBandPatch(item.value)}
              />
            </aside>

            <div>
              {search.results.length ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  {search.results.map((listing) => (
                    <DomainCard key={listing.id} listing={listing} />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-line bg-white p-8 text-center shadow-panel">
                  <p className="text-lg font-semibold">No matching domains</p>
                  <p className="mt-2 text-sm text-ink/62">Try a broader TLD, category, or price range.</p>
                </div>
              )}

              <PaginationControls params={params} pagination={search.pagination} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function toFilters(params: Record<string, string | string[] | undefined>): DomainFilters {
  return {
    q: valueOf(params.q),
    tld: valueOf(params.tld),
    maxPrice: numberOf(params.maxPrice),
    minPrice: numberOf(params.minPrice),
    category: valueOf(params.category),
    maxLength: numberOf(params.maxLength),
    minTraffic: numberOf(params.minTraffic),
    minConfidence: numberOf(params.minConfidence),
    listingType: valueOf(params.listingType) as DomainFilters["listingType"],
    sort: valueOf(params.sort) as DomainFilters["sort"]
  };
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberOf(value: string | string[] | undefined) {
  const single = valueOf(value);
  return single ? Number(single) : undefined;
}

function FacetGroup({
  title,
  items,
  params,
  paramName,
  toPatch
}: {
  title: string;
  items: DomainFacetValue[];
  params: Record<string, string | string[] | undefined>;
  paramName?: keyof DomainFilters;
  toPatch?: (item: DomainFacetValue) => Record<string, string | null>;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase text-ink/45">{title}</h3>
      <div className="mt-2 grid gap-1">
        {items.map((item) => (
          <Link
            key={item.value}
            className="focus-ring flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-paper hover:text-mint"
            href={pageHref(params, toPatch ? toPatch(item) : { [paramName ?? "q"]: item.value })}
          >
            <span>{item.label}</span>
            <span className="font-semibold text-ink/48">{item.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PaginationControls({
  params,
  pagination
}: {
  params: Record<string, string | string[] | undefined>;
  pagination: { page: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  return (
    <nav className="mt-6 flex items-center justify-between gap-3">
      {pagination.hasPreviousPage ? (
        <Link className="focus-ring rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-mint hover:text-mint" href={pageHref(params, { page: String(pagination.page - 1) })}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm font-semibold text-ink/56">
        Page {pagination.page} of {pagination.totalPages}
      </span>
      {pagination.hasNextPage ? (
        <Link className="focus-ring rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-mint hover:text-mint" href={pageHref(params, { page: String(pagination.page + 1) })}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function pageHref(params: Record<string, string | string[] | undefined>, patch: Record<string, string | null>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = valueOf(value);
    if (single) next.set(key, single);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  next.delete("page");
  if (patch.page) next.set("page", patch.page);
  const query = next.toString();
  return query ? `/domains?${query}` : "/domains";
}

function priceBandPatch(value: string) {
  if (value === "under_5k") return { minPrice: null, maxPrice: "4999" };
  if (value === "5k_10k") return { minPrice: "5000", maxPrice: "9999" };
  if (value === "10k_25k") return { minPrice: "10000", maxPrice: "24999" };
  return { minPrice: "25000", maxPrice: null };
}
