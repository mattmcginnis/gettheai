import type { Metadata } from "next";
import { BrainCircuit, ChartNoAxesCombined, Sparkles } from "lucide-react";
import { AppraisalWorkbench } from "@/components/appraisal-workbench";
import { ButtonLink } from "@/components/button-link";
import { DomainCard } from "@/components/domain-card";
import { MetricCard } from "@/components/metric-card";
import { listMarketplaceListings } from "@/lib/repository";

export const metadata: Metadata = {
  title: "GetThe.ai AI Domain Intelligence",
  alternates: {
    canonical: "https://getthe.com/ai"
  }
};

export default async function AiFrontPage() {
  const aiListings = await listMarketplaceListings({ tld: "ai" });

  return (
    <main>
      <section className="border-b border-line bg-white py-12">
        <div className="shell grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase text-mint">getthe.ai</p>
            <h1 className="mt-3 text-balance text-4xl font-bold leading-tight md:text-5xl">
              AI appraisal and market intelligence
            </h1>
            <p className="mt-4 text-lg leading-8 text-ink/68">
              The AI entry point turns domain curiosity into seller leads, pricing signals,
              and listings that route into the shared GetThe marketplace.
            </p>
            <div className="mt-6">
              <ButtonLink href="/domains?tld=ai">Browse .ai inventory</ButtonLink>
            </div>
          </div>
          <AppraisalWorkbench initialDomain="modeldock.ai" />
        </div>
      </section>

      <section className="py-10">
        <div className="shell grid gap-4 md:grid-cols-3">
          <MetricCard label="AI workflow" value="Appraise" detail="Price range, comparable sales, confidence." icon={<BrainCircuit size={20} />} />
          <MetricCard label="Seller copilot" value="Draft" detail="Listing copy, SEO title, pricing rationale." icon={<Sparkles size={20} />} />
          <MetricCard label="Market signal" value="Trend" detail="TLD and keyword demand surfaced to sellers." icon={<ChartNoAxesCombined size={20} />} />
        </div>
      </section>

      <section className="border-t border-line bg-paper py-12">
        <div className="shell">
          <h2 className="text-3xl font-bold">AI-native listings</h2>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {aiListings.map((listing) => (
              <DomainCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
