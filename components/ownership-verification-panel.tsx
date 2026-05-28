"use client";

import { useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";

export function OwnershipVerificationPanel() {
  const [listingId, setListingId] = useState("dom-1");
  const [token, setToken] = useState("");
  const [method, setMethod] = useState<"dns_txt" | "nameserver" | "registrar" | "manual">("dns_txt");
  const [message, setMessage] = useState("");
  const [verificationMode, setVerificationMode] = useState("");
  const [verifiedDomain, setVerifiedDomain] = useState("");
  const [loading, setLoading] = useState(false);

  async function verify() {
    setLoading(true);
    const response = await fetch(`/listings/${encodeURIComponent(listingId)}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "seller"
      },
      body: JSON.stringify({
        method,
        token: token || undefined,
        actorEmail: "seller@getthe.com"
      })
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error);
      setVerificationMode("");
      setVerifiedDomain("");
      return;
    }

    setVerifiedDomain(payload.listing.domain);
    setVerificationMode(`${payload.verification.mode} · ${payload.verification.method}`);
    setMessage(`${payload.listing.domain} verified via ${payload.verification.method}.`);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <BadgeCheck className="text-mint" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Ownership verification</h2>
      </div>
      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Listing ID or domain
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={listingId} onChange={(event) => setListingId(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Method
          <select className="focus-ring h-11 rounded-md border border-line px-3" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
            <option value="dns_txt">DNS TXT</option>
            <option value="nameserver">Nameserver</option>
            <option value="registrar">Registrar</option>
            <option value="manual">Manual admin review</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Token or nameserver
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={token} onChange={(event) => setToken(event.target.value)} placeholder="DNS TXT uses the saved listing challenge" />
        </label>
      </div>
      <button className="focus-ring mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint" onClick={verify}>
        {loading ? <Loader2 className="animate-spin" size={16} /> : <BadgeCheck size={16} />}
        Verify
      </button>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
      {verificationMode ? (
        <div className="mt-3 grid gap-2 rounded-md border border-line p-3 text-xs text-ink/62">
          <p><span className="font-bold uppercase text-ink/45">Domain</span> {verifiedDomain}</p>
          <p><span className="font-bold uppercase text-ink/45">Verification</span> {verificationMode}</p>
          <p><span className="font-bold uppercase text-ink/45">Next</span> Active listings can receive offers and Escrow.com handoffs.</p>
        </div>
      ) : null}
    </div>
  );
}
