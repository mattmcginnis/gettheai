import type { Metadata } from "next";
import { launchPolicies, runbooks } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Legal And Operations"
};

export default function LegalPage() {
  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <h1 className="text-4xl font-bold">Legal and operations</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            Launch posture for the operating entity, counsel-drafted policies,
            Escrow.com handoff, marketplace rules, and dispute response.
          </p>
        </div>
      </section>

      <section className="py-10">
        <div className="shell grid gap-6 lg:grid-cols-2">
          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <h2 className="text-2xl font-bold">Policy set</h2>
            <div className="mt-5 grid gap-4">
              {launchPolicies.map((policy) => (
                <div key={policy.title} className="rounded-md bg-paper p-4">
                  <p className="font-semibold">{policy.title}</p>
                  <p className="mt-2 text-sm leading-6 text-ink/66">{policy.body}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <h2 className="text-2xl font-bold">Runbooks</h2>
            <div className="mt-5 grid gap-3">
              {runbooks.map((runbook) => (
                <div key={runbook} className="rounded-md border border-line p-4 text-sm leading-6 text-ink/68">
                  {runbook}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
