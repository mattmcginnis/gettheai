"use client";

import { useState } from "react";
import { FileCheck2, Loader2, PlusCircle } from "lucide-react";

export function ListingWorkbench({ initialDomain = "clearledger.com" }: { initialDomain?: string }) {
  const [domain, setDomain] = useState(initialDomain);
  const [price, setPrice] = useState(7200);
  const [minimumOffer, setMinimumOffer] = useState(5000);
  const [registrar, setRegistrar] = useState("Namecheap");
  const [category, setCategory] = useState("SaaS");
  const [result, setResult] = useState("");
  const [verification, setVerification] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult("");
    setVerification("");

    const response = await fetch("/listings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "seller"
      },
      body: JSON.stringify({
        domain,
        price,
        minimumOffer,
        registrar,
        category
      })
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setResult(payload.error ?? "Listing could not be created.");
      return;
    }

    setResult(`${payload.listing.domain} is pending ownership verification.`);
    const verificationRecord = payload.listing.ownershipVerification;
    if (verificationRecord?.record && verificationRecord?.value) {
      setVerification(`${verificationRecord.record} TXT ${verificationRecord.value}`);
    }
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <PlusCircle className="text-mint" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Create listing</h2>
      </div>
      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">
          Domain
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={domain} onChange={(event) => setDomain(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Buy-now price
          <input className="focus-ring h-11 rounded-md border border-line px-3" type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Minimum offer
          <input className="focus-ring h-11 rounded-md border border-line px-3" type="number" value={minimumOffer} onChange={(event) => setMinimumOffer(Number(event.target.value))} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Registrar
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={registrar} onChange={(event) => setRegistrar(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Category
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={category} onChange={(event) => setCategory(event.target.value)} />
        </label>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint sm:col-span-2">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <FileCheck2 size={16} />}
          Save and verify
        </button>
      </form>
      {result ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{result}</p> : null}
      {verification ? <p className="mt-3 rounded-md border border-line p-3 text-xs font-semibold text-ink/62">{verification}</p> : null}
    </div>
  );
}
