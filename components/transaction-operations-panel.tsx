"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import type { Transaction, TransactionStatus } from "@/lib/types";

const statuses: TransactionStatus[] = [
  "escrow_started",
  "buyer_funded",
  "domain_transfer_started",
  "transfer_verified",
  "payout_complete",
  "closed",
  "canceled",
  "disputed"
];

export function TransactionOperationsPanel({ transaction }: { transaction: Transaction }) {
  const [status, setStatus] = useState<TransactionStatus>(transaction.status);
  const [checklist, setChecklist] = useState(transaction.transferChecklist);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"save" | "sync" | null>(null);

  async function save() {
    setLoading("save");
    setMessage("");
    const response = await fetch(`/transactions/${encodeURIComponent(transaction.id)}/operations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "admin"
      },
      body: JSON.stringify({
        status,
        actorEmail: "admin@getthe.com",
        note: note || undefined,
        checklistUpdates: checklist.map((item, index) => ({ index, done: item.done }))
      })
    });
    const payload = await response.json();
    setLoading(null);
    setMessage(response.ok ? `Transaction ${payload.transaction?.status ?? status} saved.` : payload.error ?? "Update failed.");
  }

  async function sync() {
    setLoading("sync");
    setMessage("");
    const response = await fetch("/admin/escrow/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "admin"
      },
      body: JSON.stringify({
        transactionId: transaction.id,
        actorEmail: "admin@getthe.com"
      })
    });
    const payload = await response.json();
    setLoading(null);
    setMessage(response.ok ? "Escrow.com status synced." : payload.error ?? "Sync failed.");
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <ShieldAlert className="text-coral" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Admin operations</h2>
      </div>
      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Status
          <select
            className="focus-ring h-11 rounded-md border border-line px-3"
            value={status}
            onChange={(event) => setStatus(event.target.value as TransactionStatus)}
          >
            {statuses.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-2">
          {checklist.map((item, index) => (
            <label key={item.label} className="flex items-center gap-3 rounded-md border border-line p-3 text-sm">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(event) => {
                  const next = checklist.map((candidate, candidateIndex) =>
                    candidateIndex === index ? { ...candidate, done: event.target.checked } : candidate
                  );
                  setChecklist(next);
                }}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Operation note
          <textarea
            className="focus-ring min-h-24 rounded-md border border-line p-3"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint" onClick={save}>
          {loading === "save" ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
          Save
        </button>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:border-mint hover:text-mint" onClick={sync}>
          {loading === "sync" ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          Sync escrow
        </button>
      </div>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}
