"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/appraisal";
import type { Appraisal } from "@/lib/types";

export function AppraisalWorkbench({ initialDomain = "" }: { initialDomain?: string }) {
  const [domain, setDomain] = useState(initialDomain);
  const [result, setResult] = useState<Appraisal | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/appraise", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain })
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error ?? "Unable to appraise this domain.");
      setResult(null);
      return;
    }

    setResult(payload.appraisal);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-2 text-sm font-semibold">
          AI appraisal
          <input
            className="focus-ring h-12 rounded-md border border-line px-4 text-base"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="modeldock.ai"
          />
        </label>
        <button className="focus-ring mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white hover:bg-mint" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
          Appraise
        </button>
      </form>

      {error ? <p className="mt-4 rounded-md border border-coral/25 bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}

      {result ? (
        <div className="mt-5 grid gap-5">
          <div className="grid gap-3 md:grid-cols-3">
            <ResultStat label="Estimate" value={`${formatMoney(result.lowEstimate)}-${formatMoney(result.highEstimate)}`} />
            <ResultStat label="Confidence" value={`${result.confidence}%`} />
            <ResultStat label="Model" value={result.modelVersion.replace("getthe-", "")} />
          </div>
          <div className="rounded-md bg-paper p-4">
            <p className="text-sm leading-6 text-ink/75">{result.generatedSummary}</p>
            <p className="mt-3 text-xs leading-5 text-ink/55">{result.disclaimer}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.keywordSignals.map((signal) => (
              <span key={signal} className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink/66">
                {signal}
              </span>
            ))}
          </div>
          <a className="focus-ring inline-flex w-fit items-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-semibold text-white" href={`/seller?domain=${encodeURIComponent(result.domain)}`}>
            List this domain
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      ) : null}
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="text-xs font-semibold uppercase text-ink/48">{label}</p>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  );
}
