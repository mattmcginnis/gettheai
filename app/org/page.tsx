import type { Metadata } from "next";
import { Building2, Handshake, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { DomainCard } from "@/components/domain-card";
import { MetricCard } from "@/components/metric-card";
import { listMarketplaceListings } from "@/lib/repository";

export const metadata: Metadata = {
  title: "GetThe.org Mission-Ready Domains",
  alternates: {
    canonical: "https://getthe.com/org"
  }
};

export default async function OrgFrontPage() {
  const orgListings = await listMarketplaceListings({ tld: "org" });

  return (
    <main>
      <section className="border-b border-line bg-white py-12">
        <div className="shell grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase text-gold">getthe.org</p>
            <h1 className="mt-3 text-balance text-4xl font-bold leading-tight md:text-5xl">
              .org domains for mission-driven teams
            </h1>
            <p className="mt-4 text-lg leading-8 text-ink/68">
              A focused acquisition front for nonprofit, civic, education, open-source,
              and public-benefit names inside the shared GetThe marketplace.
            </p>
            <div className="mt-6">
              <ButtonLink href="/domains?tld=org">Browse .org inventory</ButtonLink>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <MetricCard label="Positioning" value="Mission" detail="Clear .org buyer intent." icon={<Building2 size={20} />} />
            <MetricCard label="Transaction" value="Escrow" detail="Funds handled by Escrow.com." icon={<ShieldCheck size={20} />} />
            <MetricCard label="Sellers" value="Low fee" detail="7% completed-sale commission." icon={<Handshake size={20} />} />
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="shell">
          <h2 className="text-3xl font-bold">Featured .org inventory</h2>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {orgListings.map((listing) => (
              <DomainCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
