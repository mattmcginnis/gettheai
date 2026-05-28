import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Download, XCircle } from "lucide-react";
import { requirePageRole } from "@/lib/page-auth";
import { betaChecklist, getLaunchGates } from "@/lib/beta-checklist";

export const metadata: Metadata = {
  title: "Private Beta Checklist"
};

export default async function AdminBetaChecklistPage() {
  await requirePageRole(["admin"], "/admin/beta-checklist");
  const gates = getLaunchGates();
  const failedGates = gates.filter((gate) => gate.status === "fail");
  const warningGates = gates.filter((gate) => gate.status === "warn");

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <p className="text-sm font-bold uppercase text-coral">Launch readiness</p>
          <h1 className="mt-2 text-4xl font-bold">Private beta checklist</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            Operational checkpoints to clear before inviting sellers and buyers into the beta.
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-6">
          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="text-coral" size={20} aria-hidden="true" />
                <h2 className="text-2xl font-bold">Launch gates</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:border-mint hover:text-mint" href="/admin/launch-readiness">
                  <Download size={15} aria-hidden="true" />
                  JSON
                </Link>
                <Link className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold hover:border-mint hover:text-mint" href="/admin/launch-readiness?format=csv">
                  <Download size={15} aria-hidden="true" />
                  CSV
                </Link>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <ReadinessSummary label="Pass" value={gates.length - failedGates.length - warningGates.length} tone="mint" />
              <ReadinessSummary label="Warn" value={warningGates.length} tone="gold" />
              <ReadinessSummary label="Fail" value={failedGates.length} tone="coral" />
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {gates.map((gate) => (
                <div key={gate.id} className="flex gap-3 rounded-md border border-line p-3 text-sm text-ink/72">
                  <GateIcon status={gate.status} />
                  <span>
                    <span className="block font-semibold">{gate.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-ink/55">{gate.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {failedGates.length || warningGates.length ? (
            <div className="rounded-md border border-line bg-white p-5 shadow-panel">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-gold" size={20} aria-hidden="true" />
                <h2 className="text-2xl font-bold">Open readiness work</h2>
              </div>
              <div className="mt-5 grid gap-3">
                {[...failedGates, ...warningGates].map((gate) => (
                  <div key={gate.id} className="rounded-md border border-line p-3 text-sm text-ink/72">
                    <div className="flex items-center gap-2 font-semibold">
                      <GateIcon status={gate.status} />
                      {gate.label}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-ink/55">{gate.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            {betaChecklist.map((group) => (
              <div key={group.group} className="rounded-md border border-line bg-white p-5 shadow-panel">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="text-mint" size={20} aria-hidden="true" />
                  <h2 className="text-2xl font-bold">{group.group}</h2>
                </div>
                <div className="mt-5 grid gap-3">
                  {group.items.map((item) => (
                    <div key={item} className="flex gap-3 rounded-md border border-line p-3 text-sm text-ink/72">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-mint" size={17} aria-hidden="true" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function ReadinessSummary({ label, value, tone }: { label: string; value: number; tone: "mint" | "gold" | "coral" }) {
  const toneClass = tone === "mint" ? "text-mint" : tone === "gold" ? "text-gold" : "text-coral";
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <p className="text-xs font-bold uppercase text-ink/48">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function GateIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") {
    return <CheckCircle2 className="mt-0.5 shrink-0 text-mint" size={17} aria-hidden="true" />;
  }

  if (status === "warn") {
    return <AlertTriangle className="mt-0.5 shrink-0 text-gold" size={17} aria-hidden="true" />;
  }

  return <XCircle className="mt-0.5 shrink-0 text-coral" size={17} aria-hidden="true" />;
}
