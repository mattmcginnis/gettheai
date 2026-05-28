import type { Metadata } from "next";
import { ButtonLink } from "@/components/button-link";
import { WatchlistManager } from "@/components/watchlist-manager";
import { requirePageRole } from "@/lib/page-auth";
import { listSearchAlerts, listWatchlistItems } from "@/lib/repository";

export const metadata: Metadata = {
  title: "Watchlist"
};

export default async function BuyerWatchlistPage() {
  const session = await requirePageRole(["buyer", "seller", "admin"], "/buyer/watchlist");
  const [watchlist, alerts] = await Promise.all([
    listWatchlistItems({ userEmail: session.email }),
    listSearchAlerts({ userEmail: session.email })
  ]);

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-bold uppercase text-mint">Buyer tools</p>
            <h1 className="mt-2 text-4xl font-bold">Watchlist and alerts</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
              Manage saved domains and saved-search notifications from one buyer workspace.
            </p>
          </div>
          <ButtonLink href="/domains">Search inventory</ButtonLink>
        </div>
      </section>

      <section className="py-8">
        <div className="shell">
          <WatchlistManager watchlist={watchlist} alerts={alerts} />
        </div>
      </section>
    </main>
  );
}
