import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ShieldCheck, Sparkles } from "lucide-react";
import { ParkingInquiryPanel } from "@/components/parking-inquiry-panel";
import { formatMoney } from "@/lib/appraisal";
import { getMarketplaceListing, recordAnalyticsEvent } from "@/lib/repository";

export async function generateMetadata({
  params
}: {
  params: Promise<{ domain: string }>;
}): Promise<Metadata> {
  const { domain } = await params;
  const listing = await getMarketplaceListing(domain);

  if (!listing) {
    return { title: "Domain not found" };
  }

  return {
    title: `${listing.domain} is for sale`,
    description: listing.seoDescription,
    alternates: {
      canonical: `https://getthe.com/domains/${listing.domain}`
    }
  };
}

export default async function ParkedDomainPage({
  params
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const listing = await getMarketplaceListing(domain);

  if (!listing) {
    notFound();
  }

  await recordAnalyticsEvent({
    eventType: "analytics.parking.viewed",
    entityType: "domain_listing",
    entityId: listing.id,
    metadata: {
      domain: listing.domain,
      price: listing.price
    }
  });

  return (
    <main>
      <section className="border-b border-line bg-white py-12">
        <div className="shell grid gap-8 lg:grid-cols-[1fr_420px]">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-mint/10 px-3 py-1 text-sm font-semibold text-mint">.{listing.tld}</span>
              <span className="rounded-md bg-paper px-3 py-1 text-sm font-semibold text-ink/66">{listing.category}</span>
            </div>
            <h1 className="mt-4 text-balance text-5xl font-bold">{listing.domain}</h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-ink/68">{listing.description}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <ParkStat icon={<Sparkles size={17} />} label="AI range" value={`${formatMoney(listing.appraisal.lowEstimate)} to ${formatMoney(listing.appraisal.highEstimate)}`} />
              <ParkStat icon={<BadgeCheck size={17} />} label="Ownership" value={listing.ownershipVerified ? "Verified" : "Pending"} />
              <ParkStat icon={<ShieldCheck size={17} />} label="Escrow" value="Escrow.com" />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="focus-ring inline-flex h-11 items-center rounded-md bg-mint px-4 text-sm font-semibold text-white" href={`/domains/${listing.domain}`}>
                View marketplace listing
              </Link>
              <Link className="focus-ring inline-flex h-11 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold hover:border-mint hover:text-mint" href={`/sellers/${listing.seller.slug}`}>
                Seller profile
              </Link>
            </div>
          </div>
          <ParkingInquiryPanel listingId={listing.id} domain={listing.domain} price={listing.price} />
        </div>
      </section>

      <section className="py-10">
        <div className="shell grid gap-5 md:grid-cols-3">
          {listing.brandSignals.slice(0, 6).map((signal) => (
            <div key={signal} className="rounded-md border border-line bg-white p-4 text-sm font-semibold text-ink/70 shadow-panel">
              {signal}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function ParkStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-ink/48">
        <span className="text-sky">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  );
}
