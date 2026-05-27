"use client";

import { useState } from "react";
import { LifeBuoy, Loader2 } from "lucide-react";

export function SupportWorkbench() {
  const [requesterEmail, setRequesterEmail] = useState("buyer@example.com");
  const [subject, setSubject] = useState("Transfer status question");
  const [transactionId, setTransactionId] = useState("");
  const [context, setContext] = useState("Buyer wants a clear next step after Escrow.com funding.");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/support", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "buyer"
      },
      body: JSON.stringify({
        requesterEmail,
        subject,
        transactionId: transactionId || undefined,
        context
      })
    });
    const payload = await response.json();
    setLoading(false);
    setMessage(response.ok ? `Support case ${payload.supportCase.id} opened with AI draft.` : payload.error);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <LifeBuoy className="text-sky" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Support case</h2>
      </div>
      <form onSubmit={submit} className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Requester email
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={requesterEmail} onChange={(event) => setRequesterEmail(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Subject
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Transaction ID
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} placeholder="Optional" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Context
          <textarea className="focus-ring min-h-24 rounded-md border border-line p-3" value={context} onChange={(event) => setContext(event.target.value)} />
        </label>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <LifeBuoy size={16} />}
          Open case
        </button>
      </form>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}
