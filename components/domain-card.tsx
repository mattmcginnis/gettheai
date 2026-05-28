import Link from "next/link";
import { BadgeCheck, CircleDollarSign, ShieldCheck, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/appraisal";
import type { DomainListing } from "@/lib/types";

export function DomainCard({ listing }: { listing: DomainListing }) {
  return (
    <article className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/domains/${listing.domain}`} className="focus-ring rounded-md text-2xl font-bold hover:text-mint">
            {listing.domain}
          </Link>
          <p className="mt-2 text-sm text-ink/62">
            {listing.category} by{" "}
            <Link className="font-semibold hover:text-mint" href={`/sellers/${listing.seller.slug}`}>
              {listing.seller.publicName}
            </Link>
          </p>
        </div>
        <span className="rounded-md bg-mint/10 px-3 py-1 text-sm font-semibold text-mint">
          {formatMoney(listing.price)}
        </span>
      </div>

      <p className="mt-4 min-h-16 text-sm leading-6 text-ink/70">{listing.description}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Signal icon={<Sparkles size={16} />} label={`${listing.appraisal.confidence}% AI confidence`} />
        <Signal icon={<CircleDollarSign size={16} />} label={`${Math.round(listing.commissionRate * 100)}% fee`} />
        <Signal icon={<ShieldCheck size={16} />} label="Escrow handoff" />
        <Signal icon={<BadgeCheck size={16} />} label={listing.ownershipVerified ? "Verified" : "Pending"} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {listing.brandSignals.slice(0, 4).map((signal) => (
          <span key={signal} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink/66">
            {signal}
          </span>
        ))}
      </div>
    </article>
  );
}

function Signal({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-paper px-3 py-2 text-ink/72">
      <span className="text-sky">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
