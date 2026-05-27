import type { Metadata } from "next";
import { Activity, BadgeDollarSign, DatabaseZap, Flag, LifeBuoy, Radar, ShieldAlert, Users } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { formatMoney } from "@/lib/appraisal";
import { getAdminOverview } from "@/lib/repository";

export const metadata: Metadata = {
  title: "Admin Operations"
};

export default async function AdminPage() {
  const { activeListings, gmv, commission, queue, supportCases } = await getAdminOverview();

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

          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <div className="flex items-center gap-2">
              <DatabaseZap className="text-mint" size={20} aria-hidden="true" />
              <h2 className="text-2xl font-bold">Indexing</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-ink/68">
              Sync active listings to Meilisearch or Typesense when credentials are configured.
              Without credentials, the endpoint reports local search mode.
            </p>
            <form action="/admin/search/sync" method="post" className="mt-5">
              <button className="focus-ring rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-mint">
                Sync search index
              </button>
            </form>
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
                  <div key={supportCase.id} className="rounded-md border border-line p-3">
                    <p className="text-sm font-semibold">{supportCase.subject}</p>
                    <p className="mt-1 text-xs text-ink/55">{supportCase.requesterEmail} · {supportCase.status}</p>
                  </div>
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
