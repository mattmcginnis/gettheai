import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, Files, ShieldCheck } from "lucide-react";
import { DomainCard } from "@/components/domain-card";
import { MetricCard } from "@/components/metric-card";
import { formatMoney } from "@/lib/appraisal";
import { getSellerProfilePage } from "@/lib/repository";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getSellerProfilePage(slug);

  if (!profile) {
    return { title: "Seller not found" };
  }

  return {
    title: profile.seller.publicName,
    description: `${profile.seller.publicName} has ${profile.metrics.activeListings} active domains on GetThe.`,
    alternates: {
      canonical: `https://getthe.com/sellers/${profile.seller.slug}`
    }
  };
}

export default async function SellerProfilePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getSellerProfilePage(slug);

  if (!profile) {
    notFound();
  }

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <div className="flex flex-wrap items-center gap-2">
            {profile.seller.verified ? (
              <span className="inline-flex items-center gap-2 rounded-md bg-mint/10 px-3 py-1 text-sm font-semibold text-mint">
                <BadgeCheck size={16} aria-hidden="true" />
                Verified seller
              </span>
            ) : null}
            <span className="rounded-md bg-paper px-3 py-1 text-sm font-semibold text-ink/66">
              {profile.seller.transactionCount} completed transactions
            </span>
          </div>
          <h1 className="mt-4 text-4xl font-bold">{profile.seller.publicName}</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            Public portfolio, seller trust signals, and active GetThe inventory.
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-4">
          <MetricCard label="Active" value={String(profile.metrics.activeListings)} detail={`${profile.metrics.pendingListings} pending verification.`} icon={<Files size={20} />} />
          <MetricCard label="Average ask" value={formatMoney(profile.metrics.averageAsk)} detail={`${formatMoney(profile.metrics.totalAsk)} total portfolio ask.`} icon={<ShieldCheck size={20} />} />
          <MetricCard label="Response" value={`${profile.seller.avgResponseHours}h`} detail="Average seller response time." icon={<Clock size={20} />} />
          <MetricCard label="Coverage" value={profile.metrics.tlds.join(", ") || "New"} detail={profile.metrics.categories.slice(0, 3).join(", ") || "Portfolio building."} icon={<BadgeCheck size={20} />} />
        </div>
      </section>

      <section className="pb-12">
        <div className="shell">
          <h2 className="text-2xl font-bold">Seller inventory</h2>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {profile.listings.map((listing) => (
              <DomainCard key={listing.id} listing={listing} />
            ))}
          </div>
          {profile.listings.length === 0 ? (
            <div className="mt-6 rounded-md border border-line bg-white p-5 text-sm text-ink/66 shadow-panel">
              No public listings are available for this seller.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
