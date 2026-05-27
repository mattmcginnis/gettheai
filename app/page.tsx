import { ArrowRight, BadgeDollarSign, ChartNoAxesCombined, ShieldCheck, Sparkles } from "lucide-react";
import { AppraisalWorkbench } from "@/components/appraisal-workbench";
import { ButtonLink } from "@/components/button-link";
import { DomainCard } from "@/components/domain-card";
import { MarketVisual } from "@/components/market-visual";
import { MetricCard } from "@/components/metric-card";
import { SearchForm } from "@/components/search-form";
import { getFeaturedListings } from "@/lib/repository";

export default async function HomePage() {
  const featured = await getFeaturedListings(3);

  return (
    <main>
      <section className="border-b border-line bg-paper py-10 md:py-14">
        <div className="shell grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink/72">
              <Sparkles size={16} className="text-mint" aria-hidden="true" />
              7% commission, Escrow.com handoff, AI appraisal
            </div>
            <h1 className="mt-5 max-w-3xl text-balance text-4xl font-bold leading-tight md:text-6xl">
              GetThe Domain Marketplace
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/68">
              Search mid-tier .com, .org, and .ai domains with transparent AI pricing,
              verified sellers, and transaction tracking that keeps funds with Escrow.com.
            </p>
            <div className="mt-7">
              <SearchForm />
            </div>
          </div>
          <MarketVisual />
        </div>
      </section>

      <section className="border-b border-line bg-white py-8">
        <div className="shell grid gap-4 md:grid-cols-4">
          <MetricCard label="Launch commission" value="7%" detail="Simple completed-sale fee." icon={<BadgeDollarSign size={20} />} />
          <MetricCard label="Target band" value="$500-$10K" detail="Mid-tier seller focus." icon={<ChartNoAxesCombined size={20} />} />
          <MetricCard label="Buyer checks" value="Tiered" detail="2FA, escrow intent, KYC review." icon={<ShieldCheck size={20} />} />
          <MetricCard label="AI posture" value="Guarded" detail="Copilot drafts, humans approve." icon={<Sparkles size={20} />} />
        </div>
      </section>

      <section className="py-12">
        <div className="shell grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-3xl font-bold">Appraise before you list</h2>
            <p className="mt-4 text-base leading-7 text-ink/66">
              The appraisal engine combines comparable sales, TLD strength, keyword signals,
              and brandability notes into a transparent price range and confidence score.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/appraisal">
                Open appraisal desk
                <ArrowRight size={16} aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href="/seller" variant="secondary">
                Seller dashboard
              </ButtonLink>
            </div>
          </div>
          <AppraisalWorkbench initialDomain="agentforge.ai" />
        </div>
      </section>

      <section className="border-y border-line bg-white py-12">
        <div className="shell">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">Featured inventory</h2>
              <p className="mt-3 text-sm text-ink/62">Seeded marketplace listings with verified ownership and AI valuation metadata.</p>
            </div>
            <ButtonLink href="/domains" variant="secondary">
              Browse all
              <ArrowRight size={16} aria-hidden="true" />
            </ButtonLink>
          </div>
          <div className="mt-7 grid gap-5 lg:grid-cols-3">
            {featured.map((listing) => (
              <DomainCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
