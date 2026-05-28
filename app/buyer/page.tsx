import type { Metadata } from "next";
import { Bell, BookmarkCheck, ShieldCheck } from "lucide-react";
import { BuyerActions } from "@/components/buyer-actions";
import { ButtonLink } from "@/components/button-link";
import { DomainCard } from "@/components/domain-card";
import { MetricCard } from "@/components/metric-card";
import { NotificationFeed } from "@/components/notification-feed";
import { SupportWorkbench } from "@/components/support-workbench";
import { TransactionTimeline } from "@/components/transaction-timeline";
import { requirePageRole } from "@/lib/page-auth";
import { getFeaturedListings } from "@/lib/repository";

export const metadata: Metadata = {
  title: "Buyer Desk"
};

export default async function BuyerPage() {
  const session = await requirePageRole(["buyer", "seller", "admin"], "/buyer");
  const listings = await getFeaturedListings(2);

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-4xl font-bold">Buyer desk</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
              Saved domains, offer readiness, verification status, and escrow transaction
              tracking for founders and operators buying mid-tier names.
            </p>
          </div>
          <ButtonLink href="/domains">Search inventory</ButtonLink>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-3">
          <MetricCard label="Verification" value="2FA" detail="Ready for offers below $5K." icon={<ShieldCheck size={20} />} />
          <MetricCard label="Watchlist" value="4" detail="Saved domains and price alerts." icon={<BookmarkCheck size={20} />} />
          <MetricCard label="Alerts" value="Weekly" detail="Digest for matched searches." icon={<Bell size={20} />} />
        </div>
      </section>

      <section className="pb-12">
        <div className="shell grid gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            <h2 className="text-2xl font-bold">Watched domains</h2>
            <div className="mt-5 grid gap-5">
              {listings.map((listing) => (
                <DomainCard key={listing.id} listing={listing} />
              ))}
            </div>
          </div>
          <div className="grid gap-6">
            <BuyerActions defaultListingId={listings[0]?.id ?? "dom-1"} />
            <NotificationFeed recipientEmail={session.email} />
            <TransactionTimeline />
            <SupportWorkbench />
          </div>
        </div>
      </section>
    </main>
  );
}
