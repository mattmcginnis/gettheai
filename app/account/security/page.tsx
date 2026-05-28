import type { Metadata } from "next";
import { KeyRound, MailCheck, RotateCcw, Smartphone } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { requirePageRole } from "@/lib/page-auth";

export const metadata: Metadata = {
  title: "Account Security"
};

export default async function AccountSecurityPage() {
  await requirePageRole(["buyer", "seller", "admin"], "/account/security");

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell">
          <h1 className="text-4xl font-bold">Account security</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
            Production auth is adapter-ready for Clerk. This local build exposes the user
            states and controls that the marketplace enforces.
          </p>
        </div>
      </section>
      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-4">
          <MetricCard label="Email" value="Verified" detail="Required before offers." icon={<MailCheck size={20} />} />
          <MetricCard label="Password" value="Reset" detail="Recovery flow placeholder." icon={<RotateCcw size={20} />} />
          <MetricCard label="2FA" value="Required" detail="Sellers and transaction users." icon={<Smartphone size={20} />} />
          <MetricCard label="Keys" value="Audit" detail="Session and device history." icon={<KeyRound size={20} />} />
        </div>
      </section>
      <section className="pb-12">
        <div className="shell rounded-md border border-line bg-white p-5 shadow-panel">
          <h2 className="text-2xl font-bold">Security actions</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {["Enroll authenticator app", "Send password reset", "Review login devices"].map((action) => (
              <button key={action} className="focus-ring rounded-md border border-line bg-paper px-4 py-3 text-left text-sm font-semibold hover:border-mint hover:text-mint">
                {action}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
