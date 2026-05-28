import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeDollarSign, ExternalLink, ShieldCheck, UserCheck } from "lucide-react";
import { TransactionOperationsPanel } from "@/components/transaction-operations-panel";
import { TransactionTimeline } from "@/components/transaction-timeline";
import { formatMoney } from "@/lib/appraisal";
import { requirePageRole } from "@/lib/page-auth";
import { getTransactionDetail } from "@/lib/repository";

export const metadata: Metadata = {
  title: "Transaction Detail"
};

export default async function TransactionDetailPage({
  params
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  const session = await requirePageRole(["buyer", "seller", "admin"], `/transactions/${transactionId}`);
  const detail = await getTransactionDetail(transactionId);

  if (!detail) {
    notFound();
  }

  const { transaction, listing, buyer } = detail;

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-bold uppercase text-mint">Escrow.com transaction</p>
            <h1 className="mt-2 text-4xl font-bold">{listing.domain}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
              Track buyer funding, domain transfer tasks, provider status, fee records,
              and audit-ready handoff state for this sale.
            </p>
          </div>
          <a
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-mint"
            href={transaction.escrowUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open Escrow.com
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-4">
          <TransactionStat label="Amount" value={formatMoney(transaction.amount)} icon={<BadgeDollarSign size={18} />} />
          <TransactionStat label="Commission" value={formatMoney(transaction.commission)} icon={<BadgeDollarSign size={18} />} />
          <TransactionStat label="Status" value={transaction.status.replaceAll("_", " ")} icon={<ShieldCheck size={18} />} />
          <TransactionStat label="Buyer" value={buyer.verificationTier.replaceAll("_", " ")} icon={<UserCheck size={18} />} />
        </div>
      </section>

      <section className="pb-12">
        <div className="shell grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="rounded-md border border-line bg-white p-5 shadow-panel">
            <h2 className="text-2xl font-bold">Provider timeline</h2>
            <div className="mt-5 grid gap-3">
              {transaction.statusTimeline.map((entry) => (
                <div key={`${entry.status}-${entry.at}`} className="rounded-md border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold">{entry.status.replaceAll("_", " ")}</p>
                    <span className="text-xs font-semibold text-ink/50">{new Date(entry.at).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink/62">{entry.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            <TransactionTimeline transaction={transaction} />
            {session.role === "admin" ? <TransactionOperationsPanel transaction={transaction} /> : null}
            <div className="rounded-md border border-line bg-white p-5 shadow-panel">
              <h2 className="text-xl font-bold">Parties</h2>
              <div className="mt-4 grid gap-3 text-sm">
                <p><span className="font-semibold">Buyer:</span> {transaction.buyerEmail}</p>
                <p><span className="font-semibold">Seller:</span> {listing.seller.publicName}</p>
                <p><span className="font-semibold">Escrow ID:</span> {transaction.escrowId}</p>
                <p><span className="font-semibold">Payout:</span> {detail.payoutState}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function TransactionStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-4 shadow-panel">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-ink/48">
        <span className="text-mint">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-lg font-bold capitalize">{value}</p>
    </div>
  );
}
