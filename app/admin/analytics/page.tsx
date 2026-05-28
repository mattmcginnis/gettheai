import type { Metadata } from "next";
import { Activity, BadgeDollarSign, Eye, HandCoins, SearchCheck, Sparkles } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { formatMoney } from "@/lib/appraisal";
import { requirePageRole } from "@/lib/page-auth";
import { getOperationalAnalytics } from "@/lib/repository";

export const metadata: Metadata = {
  title: "Operational Analytics"
};

export default async function AdminAnalyticsPage() {
  await requirePageRole(["admin"], "/admin/analytics");
  const analytics = await getOperationalAnalytics();

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <p className="text-sm font-bold uppercase text-coral">Admin analytics</p>
          <h1 className="mt-2 text-4xl font-bold">Marketplace funnel</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            Operational conversion signals for appraisal, search, offer, escrow, and completed GMV.
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-3">
          <MetricCard label="Appraisals" value={String(analytics.appraisalCount)} detail={`${analytics.appraisalToListingRate}% appraisal-to-listing rate.`} icon={<Sparkles size={20} />} />
          <MetricCard label="Searches" value={String(analytics.searchCount)} detail={`${analytics.searchToDetailRate}% search-to-detail rate.`} icon={<SearchCheck size={20} />} />
          <MetricCard label="Detail views" value={String(analytics.detailViewCount)} detail="Listing pages viewed from marketplace traffic." icon={<Eye size={20} />} />
          <MetricCard label="Offers" value={String(analytics.offerCount)} detail={`${analytics.offerRate}% offer rate from detail views.`} icon={<HandCoins size={20} />} />
          <MetricCard label="Escrow starts" value={String(analytics.escrowStartedCount)} detail={`${analytics.escrowStartRate}% offer-to-escrow rate.`} icon={<Activity size={20} />} />
          <MetricCard label="Completed GMV" value={formatMoney(analytics.completedGmv)} detail={`${analytics.failedHandoffCount} failed handoffs logged.`} icon={<BadgeDollarSign size={20} />} />
        </div>
      </section>
    </main>
  );
}
