import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Filter, ShieldCheck } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { formatMoney } from "@/lib/appraisal";
import { requirePageRole } from "@/lib/page-auth";
import { listTransactionDashboard } from "@/lib/repository";
import type { TransactionStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Transaction Dashboard"
};

const statuses: Array<TransactionStatus | "all"> = [
  "all",
  "initiated",
  "escrow_started",
  "buyer_funded",
  "domain_transfer_started",
  "transfer_verified",
  "payout_complete",
  "closed",
  "canceled",
  "disputed"
];

export default async function TransactionDashboardPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageRole(["buyer", "seller", "admin"], "/transactions/dashboard");
  const params = await searchParams;
  const status = normalizeStatus(value(params.status));
  const party = normalizeParty(value(params.party));
  const q = value(params.q);
  const transactions = await listTransactionDashboard({
    email: session.email,
    role: session.role,
    status,
    party,
    q
  });
  const openTransactions = transactions.filter((transaction) => !["closed", "canceled"].includes(transaction.status)).length;
  const escrowStarted = transactions.filter((transaction) => transaction.escrowId).length;
  const totalGmv = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-4xl font-bold">Transaction dashboard</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
              Escrow handoff state, transfer checklist visibility, and buyer/seller filtering.
            </p>
          </div>
          <Link className="focus-ring inline-flex h-11 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white" href="/domains">
            Search inventory
          </Link>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-3">
          <MetricCard label="Visible" value={String(transactions.length)} detail={`${openTransactions} active transaction records.`} icon={<Filter size={20} />} />
          <MetricCard label="Escrow IDs" value={String(escrowStarted)} detail="Handoffs with provider references." icon={<ShieldCheck size={20} />} />
          <MetricCard label="GMV" value={formatMoney(totalGmv)} detail="Filtered transaction amount." icon={<ShieldCheck size={20} />} />
        </div>
      </section>

      <section className="pb-12">
        <div className="shell grid gap-6">
          <form className="grid gap-3 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-[1fr_180px_180px_auto]">
            <label className="grid gap-1 text-sm font-semibold">
              Search
              <input className="focus-ring h-11 rounded-md border border-line px-3" name="q" defaultValue={q ?? ""} placeholder="Domain, buyer, seller, escrow" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Status
              <select className="focus-ring h-11 rounded-md border border-line px-3" name="status" defaultValue={status}>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Party
              <select className="focus-ring h-11 rounded-md border border-line px-3" name="party" defaultValue={party}>
                <option value="all">all</option>
                <option value="buyer">buyer</option>
                <option value="seller">seller</option>
              </select>
            </label>
            <button className="focus-ring mt-auto h-11 rounded-md bg-mint px-4 text-sm font-semibold text-white" type="submit">
              Apply
            </button>
          </form>

          <div className="grid gap-3">
            {transactions.map((transaction) => (
              <article key={transaction.id} className="rounded-md border border-line bg-white p-5 shadow-panel">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Link className="focus-ring rounded-md text-xl font-bold hover:text-mint" href={`/transactions/${transaction.id}`}>
                      {transaction.domain}
                    </Link>
                    <p className="mt-2 text-sm text-ink/60">
                      Buyer {transaction.buyerEmail} · Seller {transaction.sellerName}
                    </p>
                  </div>
                  <span className="rounded-md bg-paper px-3 py-1 text-sm font-semibold text-ink/70">
                    {transaction.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <DashboardStat label="Amount" value={formatMoney(transaction.amount)} />
                  <DashboardStat label="Commission" value={formatMoney(transaction.commission)} />
                  <DashboardStat label="Escrow" value={transaction.escrowId ?? "pending"} />
                  <DashboardStat label="Updated" value={new Date(transaction.updatedAt).toLocaleDateString("en-US")} />
                </div>
                {transaction.escrowUrl ? (
                  <a
                    className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-mint hover:text-ink"
                    href={transaction.escrowUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Escrow.com
                    <ExternalLink size={16} aria-hidden="true" />
                  </a>
                ) : null}
              </article>
            ))}
            {transactions.length === 0 ? (
              <div className="rounded-md border border-line bg-white p-5 text-sm text-ink/66 shadow-panel">
                No transactions match these filters.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function DashboardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-paper p-3">
      <p className="text-xs font-bold uppercase text-ink/48">{label}</p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

function normalizeStatus(input: string | undefined): TransactionStatus | "all" {
  return statuses.includes(input as TransactionStatus | "all") ? (input as TransactionStatus | "all") : "all";
}

function normalizeParty(input: string | undefined): "all" | "buyer" | "seller" {
  return input === "buyer" || input === "seller" ? input : "all";
}
