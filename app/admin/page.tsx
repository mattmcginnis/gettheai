import type { Metadata } from "next";
import {
  Activity,
  BadgeDollarSign,
  HandCoins,
  ScrollText,
  ShieldAlert,
  Tags,
  Users
} from "lucide-react";
import { AdminActionsPanel } from "@/components/admin-actions-panel";
import { AlertDeliveryPanel } from "@/components/alert-delivery-panel";
import { MetricCard } from "@/components/metric-card";
import {
  AdminFilters,
  AdminPanel,
  IndexingCard,
  InquiriesCard,
  ModerationScanCard,
  ReviewQueuePanel,
  SupportCopilotPanel,
  UsersPanel
} from "@/components/admin-dashboard";
import { requirePageRole } from "@/lib/page-auth";
import { formatMoney } from "@/lib/appraisal";
import { getAdminOverview, type AdminOperationFilters } from "@/lib/repository";

export const metadata: Metadata = {
  title: "Admin Operations"
};

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageRole(["admin"], "/admin");
  const params = await searchParams;
  const filters = parseAdminFilters(params);
  const { activeListings, gmv, commission, queue, supportCases, operations } = await getAdminOverview(filters);

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <p className="text-sm font-bold uppercase text-coral">Admin</p>
          <h1 className="mt-2 text-4xl font-bold">Operations dashboard</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            Review flagged listings, suspicious offers, escrow handoffs, support cases,
            and AI-generated actions before they affect users.
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-4">
          <MetricCard label="Active listings" value={String(activeListings.length)} detail="Marketplace inventory." icon={<Activity size={20} />} />
          <MetricCard label="Listed GMV" value={formatMoney(gmv)} detail="Current active ask total." icon={<BadgeDollarSign size={20} />} />
          <MetricCard label="Fee pipeline" value={formatMoney(commission)} detail="At 7% completed-sale rate." icon={<Users size={20} />} />
          <MetricCard label="Review queue" value={String(queue.length)} detail="Open trust and policy items." icon={<ShieldAlert size={20} />} />
        </div>
      </section>

      <section className="pb-12">
        <div className="shell grid gap-6 lg:grid-cols-[1fr_380px]">
          <AdminFilters filters={filters} />

          <ReviewQueuePanel queue={queue} />

          <AdminActionsPanel />

          <UsersPanel users={operations.users} />

          <AdminPanel
            icon={<Tags className="text-mint" size={20} aria-hidden="true" />}
            title="Listings"
            rows={operations.listings.map((listing) => ({
              id: listing.id,
              title: listing.domain,
              meta: `${listing.status} · ${listing.seller} · ${formatMoney(listing.price)}`,
              href: `/admin/listings/${listing.id}`
            }))}
          />

          <AdminPanel
            icon={<HandCoins className="text-coral" size={20} aria-hidden="true" />}
            title="Offers"
            rows={operations.offers.map((offer) => ({
              id: offer.id,
              title: `${offer.domain} · ${formatMoney(offer.amount)}`,
              meta: `${offer.status} · ${offer.buyerEmail}`,
              href: `/admin/offers/${offer.id}`
            }))}
            empty="No persisted offers yet."
          />

          <AdminPanel
            icon={<BadgeDollarSign className="text-mint" size={20} aria-hidden="true" />}
            title="Transactions"
            rows={operations.transactions.map((transaction) => ({
              id: transaction.id,
              title: `${transaction.domain} · ${formatMoney(transaction.amount)}`,
              meta: `${transaction.status} · ${transaction.escrowId ?? "no escrow id"}`,
              href: `/admin/transactions/${transaction.id}`
            }))}
            empty="No persisted transactions yet."
          />

          <InquiriesCard />

          <AdminPanel
            icon={<ScrollText className="text-sky" size={20} aria-hidden="true" />}
            title="Audit trail"
            rows={operations.auditEvents.map((event) => ({
              id: event.id,
              title: event.eventType,
              meta: `${event.entityType} · ${event.actorEmail ?? "system"}`,
              href: `/admin/audit/${event.id}`
            }))}
            empty="No persisted audit events yet."
          />

          <IndexingCard />

          <AlertDeliveryPanel />

          <ModerationScanCard />

          <SupportCopilotPanel supportCases={supportCases} />
        </div>
      </section>
    </main>
  );
}

function parseAdminFilters(params: Record<string, string | string[] | undefined>): AdminOperationFilters {
  const kind = getParam(params.kind);
  return {
    q: getParam(params.q),
    status: getParam(params.status),
    kind: kind === "users" || kind === "listings" || kind === "offers" || kind === "transactions" || kind === "audit" ? kind : "all"
  };
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
