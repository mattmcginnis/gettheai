import type { Metadata } from "next";
import { DomainCard } from "@/components/domain-card";
import { SearchForm } from "@/components/search-form";
import { listMarketplaceListings } from "@/lib/repository";
import type { DomainFilters } from "@/lib/types";

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
  const results = await listMarketplaceListings(filters);

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
              <p className="text-sm font-semibold text-ink/62">{results.length} active listings</p>
              <h2 className="mt-1 text-2xl font-bold">Marketplace inventory</h2>
            </div>
          </div>

          {results.length ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {results.map((listing) => (
                <DomainCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-line bg-white p-8 text-center shadow-panel">
              <p className="text-lg font-semibold">No matching domains</p>
              <p className="mt-2 text-sm text-ink/62">Try a broader TLD, category, or price range.</p>
            </div>
          )}
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
