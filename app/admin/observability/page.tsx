import type { Metadata } from "next";
import { Activity, Database, Radar, ShieldCheck } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { requirePageRole } from "@/lib/page-auth";
import { getRuntimeDiagnostics } from "@/lib/observability";
import { getAdminOperations } from "@/lib/repository";

export const metadata: Metadata = {
  title: "Admin Observability"
};

export default async function AdminObservabilityPage() {
  await requirePageRole(["admin"], "/admin/observability");
  const diagnostics = getRuntimeDiagnostics();
  const operations = await getAdminOperations({ kind: "audit" });
  const auditEvents = operations.auditEvents.slice(0, 12);

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <p className="text-sm font-bold uppercase text-coral">Admin</p>
          <h1 className="mt-2 text-4xl font-bold">Observability</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            Runtime modes, integration posture, and recent audit events for private beta operations.
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-4">
          <MetricCard label="Database" value={diagnostics.database} detail="Source of truth mode." icon={<Database size={20} />} />
          <MetricCard label="Search" value={diagnostics.search} detail="Marketplace query provider." icon={<Radar size={20} />} />
          <MetricCard label="Escrow" value={diagnostics.escrow} detail="Funds stay external." icon={<ShieldCheck size={20} />} />
          <MetricCard label="Auth" value={diagnostics.localAuthFallback ? "Fallback" : "Provider"} detail="Page and API RBAC." icon={<Activity size={20} />} />
        </div>
      </section>

      <section className="pb-12">
        <div className="shell grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <h2 className="text-2xl font-bold">Runtime</h2>
            <dl className="mt-5 grid gap-3 text-sm">
              {Object.entries(diagnostics).map(([key, value]) => (
                <div key={key} className="rounded-md border border-line p-3">
                  <dt className="text-xs font-bold uppercase text-ink/45">{key}</dt>
                  <dd className="mt-1 text-ink/72">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <h2 className="text-2xl font-bold">Recent audit events</h2>
            <div className="mt-5 grid gap-3">
              {auditEvents.length ? (
                auditEvents.map((event) => (
                  <div key={event.id} className="rounded-md border border-line p-3">
                    <p className="text-sm font-semibold">{event.eventType}</p>
                    <p className="mt-1 text-xs text-ink/55">{event.entityType} · {event.actorEmail ?? "system"}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-md bg-paper p-3 text-sm text-ink/62">No audit events yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
