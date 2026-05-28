import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  BadgeDollarSign,
  DatabaseZap,
  Filter,
  Flag,
  HandCoins,
  LifeBuoy,
  Radar,
  ScrollText,
  ShieldAlert,
  Tags,
  Users
} from "lucide-react";
import { AdminActionsPanel } from "@/components/admin-actions-panel";
import { MetricCard } from "@/components/metric-card";
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

          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <div className="flex items-center gap-2">
              <Flag className="text-coral" size={20} aria-hidden="true" />
              <h2 className="text-2xl font-bold">Review queue</h2>
            </div>
            <div className="mt-5 grid gap-3">
              {queue.map((item) => (
                <div key={item.id} className="rounded-md border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold">{item.title}</p>
                    <span className="rounded-md bg-paper px-2.5 py-1 text-xs font-bold uppercase text-ink/58">{item.severity}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink/58">{item.type.replace("_", " ")} · {item.status}</p>
                </div>
              ))}
            </div>
          </div>

          <AdminActionsPanel />

          <div className="rounded-md border border-line bg-white p-5 shadow-panel lg:col-span-2">
            <div className="flex items-center gap-2">
              <Users className="text-sky" size={20} aria-hidden="true" />
              <h2 className="text-2xl font-bold">Users and verification</h2>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {operations.users.length ? (
                operations.users.map((user) => (
                  <AdminRow
                    key={user.id}
                    title={user.email}
                    meta={`${user.role} · ${user.verificationTier} · ${user.twoFactorEnabled ? "2FA" : "2FA missing"}`}
                    href={`/admin/users/${user.id}`}
                  />
                ))
              ) : (
                <p className="rounded-md bg-paper p-3 text-sm text-ink/62">No persisted users yet.</p>
              )}
            </div>
          </div>

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

          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <div className="flex items-center gap-2">
              <DatabaseZap className="text-mint" size={20} aria-hidden="true" />
              <h2 className="text-2xl font-bold">Indexing</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-ink/68">
              Sync active listings to Meilisearch or Typesense when credentials are configured.
              Without credentials, the endpoint reports local search mode.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
            <form action="/admin/search/sync" method="post">
              <button className="focus-ring rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-mint">
                Sync search index
              </button>
            </form>
              <Link href="/admin/observability" className="focus-ring rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-mint hover:text-mint">
                View observability
              </Link>
            </div>
          </div>

          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <div className="flex items-center gap-2">
              <Radar className="text-coral" size={20} aria-hidden="true" />
              <h2 className="text-2xl font-bold">Moderation scan</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-ink/68">
              Scan inventory for trademark, ownership, prohibited-listing, and pricing-risk signals.
            </p>
            <form action="/admin/moderation/scan" method="post" className="mt-5">
              <button className="focus-ring rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-mint">
                Run scan
              </button>
            </form>
            <Link href="/admin/beta-checklist" className="focus-ring mt-3 inline-flex rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-mint hover:text-mint">
              Beta checklist
            </Link>
          </div>

          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <div className="flex items-center gap-2">
              <LifeBuoy className="text-sky" size={20} aria-hidden="true" />
              <h2 className="text-2xl font-bold">Support copilot</h2>
            </div>
            <div className="mt-5 grid gap-3 text-sm leading-6 text-ink/68">
              <p>Draft transfer status replies from transaction timelines.</p>
              <p>Escalate disputes, trademark complaints, and failed escrow handoffs.</p>
              <p>Require approval before external outreach or negotiation messages are sent.</p>
            </div>
            <div className="mt-5 grid gap-3">
              {supportCases.length ? (
                supportCases.map((supportCase) => (
                  <Link key={supportCase.id} href={`/admin/support/${supportCase.id}`} className="focus-ring rounded-md border border-line p-3 hover:border-sky">
                    <p className="text-sm font-semibold">{supportCase.subject}</p>
                    <p className="mt-1 text-xs text-ink/55">{supportCase.requesterEmail} · {supportCase.status}</p>
                  </Link>
                ))
              ) : (
                <p className="rounded-md bg-paper p-3 text-sm text-ink/62">No persisted support cases yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function AdminFilters({ filters }: { filters: AdminOperationFilters }) {
  return (
    <form className="rounded-md border border-line bg-white p-5 shadow-panel lg:col-span-2">
      <div className="flex items-center gap-2">
        <Filter className="text-sky" size={20} aria-hidden="true" />
        <h2 className="text-2xl font-bold">Record filters</h2>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
        <label className="grid gap-1 text-sm font-medium">
          Search
          <input className="focus-ring h-11 rounded-md border border-line px-3" name="q" defaultValue={filters.q ?? ""} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Kind
          <select className="focus-ring h-11 rounded-md border border-line px-3" name="kind" defaultValue={filters.kind ?? "all"}>
            {["all", "users", "listings", "offers", "transactions", "audit"].map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Status
          <input className="focus-ring h-11 rounded-md border border-line px-3" name="status" defaultValue={filters.status ?? ""} placeholder="active, pending" />
        </label>
        <button className="focus-ring mt-6 h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint">
          Apply
        </button>
      </div>
    </form>
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

function AdminPanel({
  icon,
  title,
  rows,
  empty = "No records yet."
}: {
  icon: React.ReactNode;
  title: string;
  rows: Array<{ id: string; title: string; meta: string; href?: string }>;
  empty?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      <div className="mt-5 grid gap-3">
        {rows.length ? rows.map((row) => <AdminRow key={row.id} title={row.title} meta={row.meta} href={row.href} />) : <p className="rounded-md bg-paper p-3 text-sm text-ink/62">{empty}</p>}
      </div>
    </div>
  );
}

function AdminRow({ title, meta, href }: { title: string; meta: string; href?: string }) {
  const content = (
    <>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-ink/55">{meta}</p>
    </>
  );

  return href ? (
    <Link href={href} className="focus-ring rounded-md border border-line p-3 hover:border-mint">
      {content}
    </Link>
  ) : (
    <div className="rounded-md border border-line p-3">
      {content}
    </div>
  );
}
