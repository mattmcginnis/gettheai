import type { Metadata } from "next";
import { AppraisalWorkbench } from "@/components/appraisal-workbench";
import { DomainCard } from "@/components/domain-card";
import { getFeaturedListings } from "@/lib/repository";

export const metadata: Metadata = {
  title: "AI Domain Appraisal",
  alternates: {
    canonical: "https://getthe.com/appraisal"
  }
};

export default async function AppraisalPage() {
  const listings = await getFeaturedListings(3);

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h1 className="text-balance text-4xl font-bold leading-tight md:text-5xl">AI domain appraisal</h1>
            <p className="mt-4 text-lg leading-8 text-ink/68">
              Public lead generation for sellers, transparent confidence for buyers, and
              versioned valuation metadata for marketplace audit trails.
            </p>
          </div>
          <AppraisalWorkbench initialDomain="trustrail.com" />
        </div>
      </section>

      <section className="py-10">
        <div className="shell">
          <h2 className="text-2xl font-bold">Listings using GetThe appraisal</h2>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {listings.map((listing) => (
              <DomainCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
