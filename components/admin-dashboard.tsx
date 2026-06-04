import Link from "next/link";
import {
  DatabaseZap,
  Filter,
  Flag,
  LifeBuoy,
  MessageSquareReply,
  Radar,
  Users
} from "lucide-react";
import type { AdminOperationFilters } from "@/lib/repository";
import type { AdminQueueItem, SupportCaseItem } from "@/lib/types";

export type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  verificationTier: string;
  twoFactorEnabled: boolean;
};

export function AdminFilters({ filters }: { filters: AdminOperationFilters }) {
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

export function AdminPanel({
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

export function AdminRow({ title, meta, href }: { title: string; meta: string; href?: string }) {
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

export function ReviewQueuePanel({ queue }: { queue: AdminQueueItem[] }) {
  return (
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
  );
}

export function UsersPanel({ users }: { users: AdminUserRow[] }) {
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel lg:col-span-2">
      <div className="flex items-center gap-2">
        <Users className="text-sky" size={20} aria-hidden="true" />
        <h2 className="text-2xl font-bold">Users and verification</h2>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {users.length ? (
          users.map((user) => (
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
  );
}

export function InquiriesCard() {
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <MessageSquareReply className="text-sky" size={20} aria-hidden="true" />
        <h2 className="text-2xl font-bold">Inquiries</h2>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink/68">
        Parked-domain inquiry follow-up, seller outreach status, and conversion tracking.
      </p>
      <Link href="/admin/inquiries" className="focus-ring mt-5 inline-flex rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-mint hover:text-mint">
        View inquiries
      </Link>
    </div>
  );
}

export function IndexingCard() {
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <DatabaseZap className="text-mint" size={20} aria-hidden="true" />
        <h2 className="text-2xl font-bold">Indexing</h2>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink/68">
        Marketplace search runs on Postgres by default. Sync a remote index only when
        SEARCH_INDEX_PROVIDER is set to Meilisearch or Typesense.
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
        <Link href="/admin/analytics" className="focus-ring rounded-md border border-line px-4 py-2 text-sm font-semibold hover:border-mint hover:text-mint">
          View analytics
        </Link>
      </div>
    </div>
  );
}

export function ModerationScanCard() {
  return (
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
  );
}

export function SupportCopilotPanel({ supportCases }: { supportCases: SupportCaseItem[] }) {
  return (
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
  );
}
