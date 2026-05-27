import type { Metadata } from "next";
import { BarChart3, BadgeDollarSign, SearchCheck, ShieldCheck } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { formatMoney } from "@/lib/appraisal";
import { calculateMarketplaceMetrics } from "@/lib/analytics";
import { listMarketplaceListings } from "@/lib/repository";

export const metadata: Metadata = {
  title: "Market Intelligence"
};

export default async function IntelligencePage() {
  const listings = await listMarketplaceListings();
  const metrics = calculateMarketplaceMetrics(listings);

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <p className="text-sm font-bold uppercase text-mint">Market intelligence</p>
          <h1 className="mt-2 text-4xl font-bold">GetThe marketplace signals</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            Live inventory analytics for TLD mix, pricing bands, appraisal confidence,
            keyword signals, and expected commission.
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-4">
          <MetricCard label="Listings" value={String(metrics.listingCount)} detail="Active marketplace inventory." icon={<SearchCheck size={20} />} />
          <MetricCard label="Listed GMV" value={formatMoney(metrics.listedGmv)} detail="Current active ask total." icon={<BadgeDollarSign size={20} />} />
          <MetricCard label="Confidence" value={`${metrics.appraisalConfidenceAverage}%`} detail="Average appraisal confidence." icon={<BarChart3 size={20} />} />
          <MetricCard label="Verified" value={`${metrics.verifiedListingRate}%`} detail="Ownership verification rate." icon={<ShieldCheck size={20} />} />
        </div>
      </section>

      <section className="pb-12">
        <div className="shell grid gap-6 lg:grid-cols-3">
          <IntelligenceTable
            title="TLD performance"
            rows={metrics.tldBreakdown.map((row) => [`.${row.tld}`, String(row.count), formatMoney(row.gmv)])}
            columns={["TLD", "Listings", "GMV"]}
          />
          <IntelligenceTable
            title="Categories"
            rows={metrics.categoryBreakdown.map((row) => [row.category, String(row.count), formatMoney(row.gmv)])}
            columns={["Category", "Listings", "GMV"]}
          />
          <IntelligenceTable
            title="Keyword signals"
            rows={metrics.topKeywordSignals.map((row) => [row.keyword, String(row.count), "signals"])}
            columns={["Keyword", "Count", "Type"]}
          />
        </div>
      </section>
    </main>
  );
}

function IntelligenceTable({
  title,
  columns,
  rows
}: {
  title: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-4 overflow-hidden rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink/50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 font-bold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join(":")} className="border-t border-line">
                {row.map((cell) => (
                  <td key={cell} className="px-3 py-2 text-ink/72">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
