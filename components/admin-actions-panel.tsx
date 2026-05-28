"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

type AdminAction =
  | "listing_status"
  | "seller_verification"
  | "offer_cancel"
  | "support_update"
  | "transaction_dispute";

const actionLabels: Record<AdminAction, string> = {
  listing_status: "Listing status",
  seller_verification: "Seller verification",
  offer_cancel: "Cancel offer",
  support_update: "Support status",
  transaction_dispute: "Dispute note"
};

export function AdminActionsPanel() {
  const [action, setAction] = useState<AdminAction>("listing_status");
  const [target, setTarget] = useState("");
  const [actorEmail, setActorEmail] = useState("admin@getthe.com");
  const [status, setStatus] = useState("flagged");
  const [verificationTier, setVerificationTier] = useState("two_factor");
  const [note, setNote] = useState("Manual admin action recorded for beta operations.");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/admin/actions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "admin"
      },
      body: JSON.stringify(buildPayload({ action, target, actorEmail, status, verificationTier, note }))
    });
    const payload = await response.json();

    setLoading(false);
    setMessage(response.ok ? `${actionLabels[action]} saved.` : payload.error ?? "Admin action failed.");
  }

  const needsStatus = action === "listing_status" || action === "support_update";
  const needsTier = action === "seller_verification";

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-mint" size={20} aria-hidden="true" />
        <h2 className="text-2xl font-bold">Manual actions</h2>
      </div>
      <form onSubmit={submit} className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Action
          <select
            className="focus-ring h-11 rounded-md border border-line px-3"
            value={action}
            onChange={(event) => {
              const nextAction = event.target.value as AdminAction;
              setAction(nextAction);
              setStatus(defaultStatusFor(nextAction));
              setVerificationTier("two_factor");
            }}
          >
            {Object.entries(actionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {targetLabel(action)}
          <input
            className="focus-ring h-11 rounded-md border border-line px-3"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Actor email
          <input
            className="focus-ring h-11 rounded-md border border-line px-3"
            type="email"
            value={actorEmail}
            onChange={(event) => setActorEmail(event.target.value)}
          />
        </label>
        {needsStatus ? (
          <label className="grid gap-1 text-sm font-medium">
            Status
            <select
              className="focus-ring h-11 rounded-md border border-line px-3"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {statusOptions(action).map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {needsTier ? (
          <label className="grid gap-1 text-sm font-medium">
            Verification tier
            <select
              className="focus-ring h-11 rounded-md border border-line px-3"
              value={verificationTier}
              onChange={(event) => setVerificationTier(event.target.value)}
            >
              {["two_factor", "escrow_intent", "kyc_review"].map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-sm font-medium">
          Note
          <textarea
            className="focus-ring min-h-24 rounded-md border border-line p-3"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            required={action === "offer_cancel" || action === "transaction_dispute"}
          />
        </label>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
          Save action
        </button>
      </form>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}

function buildPayload({
  action,
  target,
  actorEmail,
  status,
  verificationTier,
  note
}: {
  action: AdminAction;
  target: string;
  actorEmail: string;
  status: string;
  verificationTier: string;
  note: string;
}) {
  const base = { action, actorEmail, note };
  if (action === "listing_status") return { ...base, listingId: target, status };
  if (action === "seller_verification") {
    return { ...base, sellerEmail: target, verificationTier, twoFactorEnabled: true };
  }
  if (action === "offer_cancel") return { ...base, offerId: target };
  if (action === "support_update") return { ...base, caseId: target, status, escalationNotes: note };
  return { ...base, transactionId: target };
}

function targetLabel(action: AdminAction) {
  if (action === "seller_verification") return "Seller email";
  if (action === "offer_cancel") return "Offer ID";
  if (action === "support_update") return "Support case ID";
  if (action === "transaction_dispute") return "Transaction or escrow ID";
  return "Listing ID or domain";
}

function defaultStatusFor(action: AdminAction) {
  return action === "support_update" ? "escalated" : "flagged";
}

function statusOptions(action: AdminAction) {
  return action === "support_update" ? ["open", "waiting_on_user", "escalated", "resolved"] : ["active", "flagged", "archived"];
}
