"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { formatMoney } from "@/lib/appraisal";

export function ParkingInquiryPanel({
  listingId,
  domain,
  price
}: {
  listingId: string;
  domain: string;
  price: number;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [budget, setBudget] = useState(String(price));
  const [message, setMessage] = useState(`I am interested in ${domain}.`);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitInquiry() {
    setLoading(true);
    setStatus(null);
    const response = await fetch("/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listingId,
        name,
        email,
        budget: Number(budget),
        message
      })
    });
    const payload = await response.json();
    setLoading(false);
    setStatus(response.ok ? "Inquiry sent to the seller." : payload.error ?? "Inquiry could not be sent.");
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase text-mint">For sale</p>
          <h2 className="mt-1 text-2xl font-bold">{domain}</h2>
        </div>
        <span className="rounded-md bg-mint/10 px-3 py-1 text-sm font-semibold text-mint">{formatMoney(price)}</span>
      </div>

      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">
          Name
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Email
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Budget
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={budget} onChange={(event) => setBudget(event.target.value)} type="number" min="1" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Message
          <textarea className="focus-ring min-h-28 rounded-md border border-line p-3" value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
      </div>

      <button
        className="focus-ring mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={submitInquiry}
        disabled={loading}
      >
        {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
        Send inquiry
      </button>
      {status ? <p className="mt-3 text-sm font-semibold text-ink/70">{status}</p> : null}
    </div>
  );
}
