"use client";

import { useState } from "react";
import { BellRing, Loader2, Send } from "lucide-react";

export function AlertDeliveryPanel() {
  const [cadence, setCadence] = useState<"instant" | "daily" | "weekly">("weekly");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function deliver() {
    setLoading(true);
    setMessage("");

    const response = await fetch("/admin/alerts/deliver", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "admin"
      },
      body: JSON.stringify({ cadence })
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Alert delivery failed.");
      return;
    }

    setMessage(`${payload.delivered} of ${payload.scanned} ${cadence} alerts delivered.`);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <BellRing className="text-sky" size={20} aria-hidden="true" />
        <h2 className="text-2xl font-bold">Alert delivery</h2>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink/68">
        Run saved-search alert delivery through Postmark or the local queued-email adapter.
      </p>
      <label className="mt-5 grid gap-1 text-sm font-medium">
        Cadence
        <select
          className="focus-ring h-11 rounded-md border border-line px-3"
          value={cadence}
          onChange={(event) => setCadence(event.target.value as typeof cadence)}
        >
          <option value="instant">instant</option>
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
        </select>
      </label>
      <button
        className="focus-ring mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint disabled:opacity-55"
        disabled={loading}
        onClick={deliver}
        type="button"
      >
        {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
        Deliver alerts
      </button>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}
