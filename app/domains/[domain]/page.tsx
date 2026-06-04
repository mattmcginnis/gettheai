import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { AuctionPanel } from "@/components/auction-panel";
import { OfferPanel } from "@/components/offer-panel";
import { TransactionTimeline } from "@/components/transaction-timeline";
import { formatMoney } from "@/lib/appraisal";
import { getAuctionState, getMarketplaceListing, recordAnalyticsEvent } from "@/lib/repository";

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
    title: listing.seoTitle,
    description: listing.seoDescription,
    alternates: {
      canonical: `https://getthe.com/domains/${listing.domain}`
    }
  };
}

export default async function DomainDetailPage({
  params
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const listing = await getMarketplaceListing(domain);

  if (!listing) {
    notFound();
  }

  // Viewing an auction lazily settles it if its end time has passed.
  const auction = listing.listingType === "auction" ? await getAuctionState(listing.id) : null;

  await recordAnalyticsEvent({
    eventType: "analytics.listing.viewed",
    entityType: "domain_listing",
    entityId: listing.id,
    metadata: {
      domain: listing.domain,
      price: listing.price
    }
  });

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.domain,
    category: listing.category,
    description: listing.seoDescription,
    brand: {
      "@type": "Brand",
      name: "GetThe"
    },
    offers: {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: "USD",
      availability:
        listing.status === "active"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: `https://getthe.com/domains/${listing.domain}`
    }
  };

  return (
    <main>
      {/* JSON-LD built only from our own listing fields; `<` escaped to
          neutralize any `</script>` breakout in the serialized payload. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c")
        }}
      />
      <section className="border-b border-line bg-white py-10">
        <div className="shell grid gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-mint/10 px-3 py-1 text-sm font-semibold text-mint">.{listing.tld}</span>
              <span className="rounded-md bg-paper px-3 py-1 text-sm font-semibold text-ink/66">{listing.category}</span>
              <span className="rounded-md bg-paper px-3 py-1 text-sm font-semibold text-ink/66">{listing.listingType.replaceAll("_", " ")}</span>
            </div>
            <h1 className="mt-4 text-balance text-5xl font-bold">{listing.domain}</h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-ink/68">{listing.description}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              <Link className="focus-ring rounded-md text-mint hover:text-ink" href={`/sellers/${listing.seller.slug}`}>
                {listing.seller.publicName}
              </Link>
              <Link className="focus-ring rounded-md text-ink/62 hover:text-mint" href={`/park/${listing.domain}`}>
                Parked landing page
              </Link>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <DetailStat icon={<BadgeCheck size={17} />} label="Ownership" value={listing.ownershipVerified ? "Verified" : "Pending"} />
              <DetailStat icon={<Sparkles size={17} />} label="AI confidence" value={`${listing.appraisal.confidence}%`} />
              <DetailStat icon={<Clock size={17} />} label="Age" value={`${listing.domainAgeYears} years`} />
              <DetailStat icon={<ShieldCheck size={17} />} label="Escrow" value="Handoff" />
            </div>
          </div>
          {auction ? <AuctionPanel auction={auction} /> : <OfferPanel listing={listing} />}
        </div>
      </section>

      <section className="py-10">
        <div className="shell grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <h2 className="text-2xl font-bold">AI appraisal</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <DetailStat label="Low" value={formatMoney(listing.appraisal.lowEstimate)} />
              <DetailStat label="High" value={formatMoney(listing.appraisal.highEstimate)} />
              <DetailStat label="Ask" value={formatMoney(listing.price)} />
            </div>
            <p className="mt-5 text-sm leading-6 text-ink/70">{listing.appraisal.generatedSummary}</p>
            <p className="mt-3 text-xs leading-5 text-ink/52">{listing.appraisal.disclaimer}</p>
            <h3 className="mt-6 text-sm font-bold uppercase text-ink/48">Comparable sales</h3>
            <div className="mt-3 grid gap-3">
              {listing.appraisal.comparableSales.map((sale) => (
                <div key={sale.domain} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper p-3 text-sm">
                  <span className="font-semibold">{sale.domain}</span>
                  <span>{formatMoney(sale.price)}</span>
                  <span className="text-ink/55">{sale.venue}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-6">
            <TransactionTimeline />
            <a
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-3 text-sm font-semibold hover:border-mint hover:text-mint"
              href={`https://www.escrow.com/domain-name-holding?domain=${listing.domain}`}
              target="_blank"
              rel="noreferrer"
            >
              Escrow.com overview
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function DetailStat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-ink/48">
        {icon ? <span className="text-sky">{icon}</span> : null}
        {label}
      </div>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  );
}
