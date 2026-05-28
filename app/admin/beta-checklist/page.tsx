import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { requirePageRole } from "@/lib/page-auth";
import { betaChecklist, getLaunchGates } from "@/lib/beta-checklist";

export const metadata: Metadata = {
  title: "Private Beta Checklist"
};

export default async function AdminBetaChecklistPage() {
  await requirePageRole(["admin"], "/admin/beta-checklist");
  const gates = getLaunchGates();

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
            <div className="flex items-center gap-2">
              <ClipboardCheck className="text-coral" size={20} aria-hidden="true" />
              <h2 className="text-2xl font-bold">Launch gates</h2>
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

function GateIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") {
    return <CheckCircle2 className="mt-0.5 shrink-0 text-mint" size={17} aria-hidden="true" />;
  }

  if (status === "warn") {
    return <AlertTriangle className="mt-0.5 shrink-0 text-gold" size={17} aria-hidden="true" />;
  }

  return <XCircle className="mt-0.5 shrink-0 text-coral" size={17} aria-hidden="true" />;
}
