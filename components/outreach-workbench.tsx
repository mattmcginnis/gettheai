"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

export function OutreachWorkbench() {
  const [listingId, setListingId] = useState("dom-6");
  const [targetCompany, setTargetCompany] = useState("AI Infrastructure Labs");
  const [targetEmail, setTargetEmail] = useState("founder@example.com");
  const [context, setContext] = useState("Company recently launched model deployment tooling and may value a category-defining .ai domain.");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"draft" | "send" | null>(null);

  async function createDraft() {
    setLoading("draft");
    const response = await fetch("/ai/outreach", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "seller"
      },
      body: JSON.stringify({
        listingId,
        targetCompany,
        targetEmail,
        context,
        actorEmail: "seller@getthe.com"
      })
    });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error);
      return;
    }

    setDraft(payload.outreachDraft.draft.body);
    setMessage("Draft created. Review before approval.");
  }

  async function approveSend() {
    setLoading("send");
    const response = await fetch("/ai/outreach/approve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "seller"
      },
      body: JSON.stringify({
        targetEmail,
        subject: `${targetCompany} and a relevant GetThe domain`,
        body: draft
      })
    });
    const payload = await response.json();
    setLoading(null);
    setMessage(response.ok ? `Approved via ${payload.delivery.provider ?? "email provider"}.` : payload.error);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Send className="text-mint" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">AI outreach</h2>
      </div>
      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Listing ID or domain
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={listingId} onChange={(event) => setListingId(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Target company
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={targetCompany} onChange={(event) => setTargetCompany(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Target email
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={targetEmail} onChange={(event) => setTargetEmail(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Context
          <textarea className="focus-ring min-h-20 rounded-md border border-line p-3" value={context} onChange={(event) => setContext(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Human-approved draft
          <textarea className="focus-ring min-h-28 rounded-md border border-line p-3" value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:border-mint hover:text-mint" onClick={createDraft}>
          {loading === "draft" ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          Draft
        </button>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint" onClick={approveSend} disabled={!draft}>
          {loading === "send" ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          Approve
        </button>
      </div>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}
