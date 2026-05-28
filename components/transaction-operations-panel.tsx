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
const owners = ["buyer", "seller", "admin", "escrow"] as const;

export function TransactionOperationsPanel({ transaction }: { transaction: Transaction }) {
  const [status, setStatus] = useState<TransactionStatus>(transaction.status);
  const [checklist, setChecklist] = useState(transaction.transferChecklist);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"save" | "sync" | "retry" | null>(null);

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
        checklistUpdates: checklist.map((item, index) => ({
          index,
          done: item.done,
          owner: item.owner,
          dueAt: item.dueAt,
          note: item.note
        }))
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

  async function retryHandoff() {
    setLoading("retry");
    setMessage("");
    const response = await fetch("/admin/actions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "admin"
      },
      body: JSON.stringify({
        action: "transaction_handoff_retry",
        transactionId: transaction.id,
        actorEmail: "admin@getthe.com",
        note: note || undefined
      })
    });
    const payload = await response.json();
    setLoading(null);
    setMessage(response.ok ? "Escrow.com handoff recreated." : payload.error ?? "Recovery failed.");
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
            <div key={item.label} className="grid gap-3 rounded-md border border-line p-3 text-sm">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(event) => updateChecklist(index, { done: event.target.checked })}
                />
                <span className="font-semibold">{item.label}</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-[140px_150px_1fr]">
                <label className="grid gap-1 text-xs font-bold uppercase text-ink/48">
                  Owner
                  <select
                    className="focus-ring h-10 rounded-md border border-line px-3 text-sm normal-case text-ink"
                    value={item.owner ?? "admin"}
                    onChange={(event) => updateChecklist(index, { owner: event.target.value as typeof owners[number] })}
                  >
                    {owners.map((owner) => (
                      <option key={owner} value={owner}>{owner}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-bold uppercase text-ink/48">
                  Due
                  <input
                    className="focus-ring h-10 rounded-md border border-line px-3 text-sm normal-case text-ink"
                    type="date"
                    value={dateInputValue(item.dueAt)}
                    onChange={(event) => updateChecklist(index, { dueAt: dateToIso(event.target.value) })}
                  />
                </label>
                <label className="grid gap-1 text-xs font-bold uppercase text-ink/48">
                  Task note
                  <input
                    className="focus-ring h-10 rounded-md border border-line px-3 text-sm normal-case text-ink"
                    value={item.note ?? ""}
                    onChange={(event) => updateChecklist(index, { note: event.target.value })}
                  />
                </label>
              </div>
            </div>
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
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint" onClick={save}>
          {loading === "save" ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
          Save
        </button>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:border-mint hover:text-mint" onClick={sync}>
          {loading === "sync" ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          Sync escrow
        </button>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:border-mint hover:text-mint" onClick={retryHandoff}>
          {loading === "retry" ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          Recreate handoff
        </button>
      </div>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );

  function updateChecklist(index: number, patch: Partial<Transaction["transferChecklist"][number]>) {
    setChecklist((current) =>
      current.map((candidate, candidateIndex) => (candidateIndex === index ? { ...candidate, ...patch } : candidate))
    );
  }
}

function dateInputValue(value: string | undefined) {
  return value ? value.slice(0, 10) : "";
}

function dateToIso(value: string) {
  return value ? new Date(`${value}T17:00:00.000Z`).toISOString() : undefined;
}
