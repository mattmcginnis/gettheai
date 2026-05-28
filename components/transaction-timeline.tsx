import { CheckCircle2, Circle } from "lucide-react";
import type { Transaction } from "@/lib/types";

const defaultSteps = [
  "Escrow transaction started",
  "Buyer funds escrow",
  "Seller starts transfer",
  "Transfer verified",
  "Payout complete"
];

export function TransactionTimeline({ transaction }: { transaction?: Transaction }) {
  const steps: Transaction["transferChecklist"] =
    transaction?.transferChecklist ?? defaultSteps.map((label) => ({ label, done: false }));

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <h2 className="text-xl font-bold">Transaction timeline</h2>
      <div className="mt-5 grid gap-3">
        {steps.map((step, index) => {
          const done = transaction ? step.done : index === 0;
          return (
            <div key={step.label} className="flex items-start gap-3 rounded-md bg-paper p-3">
              {done ? <CheckCircle2 className="text-mint" size={18} /> : <Circle className="text-ink/32" size={18} />}
              <span className="text-sm">
                <span className="block font-medium">{step.label}</span>
                {step.owner || step.dueAt || step.note ? (
                  <span className="mt-1 block text-xs text-ink/52">
                    {step.owner ? `${step.owner}` : "unassigned"}
                    {step.dueAt ? ` · due ${new Date(step.dueAt).toLocaleDateString("en-US")}` : ""}
                    {step.note ? ` · ${step.note}` : ""}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
