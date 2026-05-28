import Link from "next/link";
import { HandCoins } from "lucide-react";
import { formatMoney } from "@/lib/appraisal";
import type { OfferInboxItem } from "@/lib/types";

export function OfferInbox({
  offers,
  title,
  empty = "No offers yet."
}: {
  offers: OfferInboxItem[];
  title: string;
  empty?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <HandCoins className="text-coral" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      <div className="mt-5 grid gap-3">
        {offers.length ? (
          offers.map((offer) => (
            <Link
              key={offer.id}
              className="focus-ring rounded-md border border-line p-3 hover:border-mint"
              href={`/domains/${offer.domain}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{offer.domain}</p>
                <span className="rounded-md bg-paper px-2.5 py-1 text-xs font-bold uppercase text-ink/58">
                  {offer.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink/65">
                {formatMoney(offer.amount)} · {offer.buyerVerificationTier.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-xs text-ink/50">
                Buyer {offer.buyerEmail} · Seller {offer.sellerName}
              </p>
            </Link>
          ))
        ) : (
          <p className="rounded-md bg-paper p-3 text-sm text-ink/62">{empty}</p>
        )}
      </div>
    </div>
  );
}
