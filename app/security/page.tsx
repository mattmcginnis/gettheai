import type { Metadata } from "next";
import { KeyRound, LockKeyhole, ShieldCheck, Siren } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { prohibitedListingSignals } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Security And Abuse Controls"
};

export default function SecurityPage() {
  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <h1 className="text-4xl font-bold">Security and abuse controls</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            The marketplace is designed around seller 2FA, tiered buyer verification,
            ownership verification, audit logs, and partner escrow instead of stored funds.
          </p>
        </div>
      </section>
      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-4">
          <MetricCard label="Sellers" value="2FA" detail="Required before active listings." icon={<KeyRound size={20} />} />
          <MetricCard label="Buyers" value="Tiered" detail="Higher values require stronger checks." icon={<ShieldCheck size={20} />} />
          <MetricCard label="Funds" value="Escrow" detail="GetThe never stores card data." icon={<LockKeyhole size={20} />} />
          <MetricCard label="Abuse" value="Review" detail="Trademark and ownership queues." icon={<Siren size={20} />} />
        </div>
      </section>
      <section className="pb-12">
        <div className="shell rounded-md border border-line bg-white p-5 shadow-panel">
          <h2 className="text-2xl font-bold">Prohibited listing signals</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {prohibitedListingSignals.map((signal) => (
              <div key={signal} className="rounded-md bg-paper p-4 text-sm font-medium text-ink/72">
                {signal}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
