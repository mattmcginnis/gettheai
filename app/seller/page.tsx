import type { Metadata } from "next";
import { BadgeDollarSign, FileCheck2, ShieldCheck, Sparkles } from "lucide-react";
import { AppraisalWorkbench } from "@/components/appraisal-workbench";
import { DomainCard } from "@/components/domain-card";
import { ImportWorkbench } from "@/components/import-workbench";
import { ListingWorkbench } from "@/components/listing-workbench";
import { MetricCard } from "@/components/metric-card";
import { OfferManagementPanel } from "@/components/offer-management-panel";
import { OwnershipVerificationPanel } from "@/components/ownership-verification-panel";
import { SupportWorkbench } from "@/components/support-workbench";
import { getFeaturedListings } from "@/lib/repository";

export const metadata: Metadata = {
  title: "Seller Dashboard"
};

export default async function SellerPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialDomain = Array.isArray(params.domain) ? params.domain[0] : params.domain;
  const listings = await getFeaturedListings(3);

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <h1 className="text-4xl font-bold">Seller dashboard</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            List verified domains, import portfolios, use AI pricing guidance, and track
            Escrow.com handoff status without locking sellers into a single marketplace.
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-4">
          <MetricCard label="Commission" value="7%" detail="Completed sales only." icon={<BadgeDollarSign size={20} />} />
          <MetricCard label="Verification" value="DNS TXT" detail="Nameserver or manual fallback." icon={<FileCheck2 size={20} />} />
          <MetricCard label="Security" value="2FA" detail="Required for sellers." icon={<ShieldCheck size={20} />} />
          <MetricCard label="AI" value="Copilot" detail="Drafts copy and price rationale." icon={<Sparkles size={20} />} />
        </div>
      </section>

      <section className="pb-12">
        <div className="shell grid gap-6 lg:grid-cols-2">
          <ListingWorkbench initialDomain={initialDomain ?? "clearledger.com"} />
          <AppraisalWorkbench initialDomain={initialDomain ?? "clearledger.com"} />
          <ImportWorkbench />
          <OwnershipVerificationPanel />
          <OfferManagementPanel />
          <SupportWorkbench />
        </div>
      </section>

      <section className="border-t border-line bg-white py-12">
        <div className="shell">
          <h2 className="text-2xl font-bold">Active seller listings</h2>
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
