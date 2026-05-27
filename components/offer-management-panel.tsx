"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MessageSquareReply, XCircle } from "lucide-react";

export function OfferManagementPanel() {
  const [offerId, setOfferId] = useState("offer_demo");
  const [amount, setAmount] = useState(7600);
  const [note, setNote] = useState("Counter is within appraisal range and seller target.");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function decide(action: "accept" | "reject" | "counter") {
    setLoading(action);
    const response = await fetch(`/offers/${encodeURIComponent(offerId)}/decision`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "seller"
      },
      body: JSON.stringify({ action, amount, note })
    });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Decision failed.");
      return;
    }

    setMessage(payload.transaction ? "Offer accepted and escrow transaction started." : `Offer ${action} recorded.`);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <MessageSquareReply className="text-gold" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Offer management</h2>
      </div>
      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Offer ID
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={offerId} onChange={(event) => setOfferId(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Counter or accepted amount
          <input className="focus-ring h-11 rounded-md border border-line px-3" type="number" value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Seller note
          <textarea className="focus-ring min-h-20 rounded-md border border-line p-3" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <DecisionButton label="Accept" loading={loading === "accept"} icon={<CheckCircle2 size={16} />} onClick={() => decide("accept")} />
        <DecisionButton label="Counter" loading={loading === "counter"} icon={<MessageSquareReply size={16} />} onClick={() => decide("counter")} />
        <DecisionButton label="Reject" loading={loading === "reject"} icon={<XCircle size={16} />} onClick={() => decide("reject")} />
      </div>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}

function DecisionButton({
  label,
  loading,
  icon,
  onClick
}: {
  label: string;
  loading: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:border-mint hover:text-mint" onClick={onClick}>
      {loading ? <Loader2 className="animate-spin" size={16} /> : icon}
      {label}
    </button>
  );
}
