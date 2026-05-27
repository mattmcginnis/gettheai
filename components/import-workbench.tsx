"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";

const sampleCsv = "domain,price,minimum offer,registrar,category\nclearledger.com,7200,5000,Namecheap,Fintech\nopensignal.org,3100,1900,Porkbun,Civic Tech";

export function ImportWorkbench() {
  const [csv, setCsv] = useState(sampleCsv);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const response = await fetch("/imports/portfolio", {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: csv
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setResult(payload.error ?? "Import failed.");
      return;
    }

    setResult(`${payload.summary.accepted} accepted, ${payload.summary.needsReview} routed to review.`);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <FileUp className="text-sky" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Portfolio import</h2>
      </div>
      <textarea
        className="focus-ring mt-4 min-h-40 w-full rounded-md border border-line p-3 text-sm"
        value={csv}
        onChange={(event) => setCsv(event.target.value)}
      />
      <button className="focus-ring mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint" onClick={submit}>
        {loading ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}
        Import listings
      </button>
      {result ? <p className="mt-3 rounded-md bg-paper p-3 text-sm text-ink/70">{result}</p> : null}
    </div>
  );
}
