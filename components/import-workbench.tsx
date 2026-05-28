"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, FileUp, Loader2, TriangleAlert } from "lucide-react";

const sampleCsv = "domain,price,minimum offer,registrar,category\nclearledger.com,7200,5000,Namecheap,Fintech\nopensignal.org,3100,1900,Porkbun,Civic Tech";

interface ImportRow {
  domain?: string;
  price?: number;
  minimumOffer?: number;
  registrar?: string;
  category?: string;
  status?: string;
  ownershipVerification?: string;
  reason?: string;
}

interface ImportResult {
  summary: {
    total: number;
    accepted: number;
    needsReview: number;
  };
  accepted: ImportRow[];
  review: ImportRow[];
}

export function ImportWorkbench() {
  const [csv, setCsv] = useState(sampleCsv);
  const [result, setResult] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setImportResult(null);
    const response = await fetch("/imports/portfolio", {
      method: "POST",
      headers: {
        "content-type": "text/csv",
        "x-getthe-role": "seller"
      },
      body: csv
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setResult(payload.error ?? "Import failed.");
      return;
    }

    setResult(`${payload.summary.accepted} accepted, ${payload.summary.needsReview} routed to review.`);
    setImportResult(payload);
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
      {importResult ? (
        <div className="mt-5 grid gap-4">
          <ImportTable
            title="Accepted"
            icon={<CheckCircle2 className="text-mint" size={17} aria-hidden="true" />}
            rows={importResult.accepted}
            empty="No rows accepted yet."
          />
          <ImportTable
            title="Needs review"
            icon={<TriangleAlert className="text-coral" size={17} aria-hidden="true" />}
            rows={importResult.review}
            empty="No review rows."
          />
        </div>
      ) : null}
    </div>
  );
}

function ImportTable({
  title,
  icon,
  rows,
  empty
}: {
  title: string;
  icon: ReactNode;
  rows: ImportRow[];
  empty: string;
}) {
  return (
    <div className="rounded-md border border-line">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        {icon}
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-paper text-ink/52">
              <tr>
                <th className="px-3 py-2 font-bold uppercase">Domain</th>
                <th className="px-3 py-2 font-bold uppercase">Ask</th>
                <th className="px-3 py-2 font-bold uppercase">Registrar</th>
                <th className="px-3 py-2 font-bold uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.domain ?? "row"}-${index}`} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">{row.domain ?? "Missing domain"}</td>
                  <td className="px-3 py-2">{row.price ? `$${row.price.toLocaleString("en-US")}` : "Needs price"}</td>
                  <td className="px-3 py-2">{row.registrar ?? "Unknown"}</td>
                  <td className="px-3 py-2">{row.reason ?? row.ownershipVerification ?? row.status ?? "pending verification"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-3 text-sm text-ink/58">{empty}</p>
      )}
    </div>
  );
}
