"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquareReply } from "lucide-react";
import { formatMoney } from "@/lib/appraisal";
import type { ParkedInquiry } from "@/lib/types";

const statuses: ParkedInquiry["status"][] = ["new", "contacted", "converted", "closed"];

export function InquiryFollowupPanel({
  inquiries,
  actorEmail,
  actorRole = "seller",
  title = "Parked inquiries"
}: {
  inquiries: ParkedInquiry[];
  actorEmail?: string;
  actorRole?: "seller" | "admin";
  title?: string;
}) {
  const [items, setItems] = useState(inquiries);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function updateInquiry(inquiry: ParkedInquiry, status: ParkedInquiry["status"], followUpNote: string) {
    setLoadingId(inquiry.id);
    setMessage("");
    const response = await fetch(`/inquiries/${encodeURIComponent(inquiry.id)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": actorRole,
        ...(actorEmail ? { "x-getthe-email": actorEmail } : {})
      },
      body: JSON.stringify({
        status,
        followUpNote: followUpNote || undefined
      })
    });
    const payload = await response.json();
    setLoadingId(null);
    if (!response.ok) {
      setMessage(payload.error ?? "Inquiry update failed.");
      return;
    }

    setItems((current) => current.map((item) => (item.id === inquiry.id ? payload.inquiry : item)));
    setMessage(`${payload.inquiry.domain} marked ${payload.inquiry.status}.`);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <MessageSquareReply className="text-sky" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      <div className="mt-5 grid gap-3">
        {items.map((inquiry) => (
          <InquiryRow
            key={inquiry.id}
            inquiry={inquiry}
            loading={loadingId === inquiry.id}
            onSave={updateInquiry}
          />
        ))}
        {items.length === 0 ? (
          <p className="rounded-md bg-paper p-3 text-sm text-ink/62">No parked inquiries match this view.</p>
        ) : null}
      </div>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}

function InquiryRow({
  inquiry,
  loading,
  onSave
}: {
  inquiry: ParkedInquiry;
  loading: boolean;
  onSave: (inquiry: ParkedInquiry, status: ParkedInquiry["status"], followUpNote: string) => void;
}) {
  const [status, setStatus] = useState<ParkedInquiry["status"]>(inquiry.status);
  const [note, setNote] = useState(inquiry.followUpNote ?? "");

  return (
    <article className="rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="focus-ring rounded-md font-semibold hover:text-mint" href={`/domains/${inquiry.domain}`}>
            {inquiry.domain}
          </Link>
          <p className="mt-1 text-xs text-ink/55">
            {inquiry.name} · {inquiry.email}
          </p>
        </div>
        <span className="rounded-md bg-paper px-2.5 py-1 text-xs font-bold uppercase text-ink/58">{inquiry.status}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink/68">{inquiry.message}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr_auto]">
        <label className="grid gap-1 text-xs font-bold uppercase text-ink/48">
          Status
          <select className="focus-ring h-10 rounded-md border border-line px-3 text-sm normal-case text-ink" value={status} onChange={(event) => setStatus(event.target.value as ParkedInquiry["status"])}>
            {statuses.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold uppercase text-ink/48">
          Follow-up note
          <input className="focus-ring h-10 rounded-md border border-line px-3 text-sm normal-case text-ink" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <button
          className="focus-ring mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => onSave(inquiry, status, note)}
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <MessageSquareReply size={16} aria-hidden="true" />}
          Save
        </button>
      </div>
      <p className="mt-3 text-xs text-ink/48">
        Budget {inquiry.budget ? formatMoney(inquiry.budget) : "not provided"} · {new Date(inquiry.createdAt).toLocaleDateString("en-US")}
      </p>
    </article>
  );
}
