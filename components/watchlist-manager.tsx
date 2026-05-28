"use client";

import { useState } from "react";
import Link from "next/link";
import { BellOff, BellRing, Loader2, Trash2 } from "lucide-react";
import type { SearchAlertItem, WatchlistItem } from "@/lib/types";

export function WatchlistManager({
  watchlist,
  alerts
}: {
  watchlist: WatchlistItem[];
  alerts: SearchAlertItem[];
}) {
  const [savedDomains, setSavedDomains] = useState(watchlist);
  const [searchAlerts, setSearchAlerts] = useState(alerts);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function removeWatch(item: WatchlistItem) {
    setLoading(item.id);
    setMessage("");
    const response = await fetch(`/watchlist/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Unable to remove watched domain.");
      return;
    }

    setSavedDomains((current) => current.filter((candidate) => candidate.id !== item.id));
    setMessage(`${item.domain} removed from watchlist.`);
  }

  async function toggleAlert(alert: SearchAlertItem) {
    setLoading(alert.id);
    setMessage("");
    const response = await fetch(`/search-alerts/${encodeURIComponent(alert.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !alert.active })
    });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Unable to update search alert.");
      return;
    }

    setSearchAlerts((current) => current.map((candidate) => (candidate.id === alert.id ? payload.searchAlert : candidate)));
    setMessage(`${payload.searchAlert.name} ${payload.searchAlert.active ? "enabled" : "paused"}.`);
  }

  async function removeAlert(alert: SearchAlertItem) {
    setLoading(alert.id);
    setMessage("");
    const response = await fetch(`/search-alerts/${encodeURIComponent(alert.id)}`, { method: "DELETE" });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Unable to delete search alert.");
      return;
    }

    setSearchAlerts((current) => current.filter((candidate) => candidate.id !== alert.id));
    setMessage(`${alert.name} deleted.`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-md border border-line bg-white p-5 shadow-panel">
        <h2 className="text-2xl font-bold">Watched domains</h2>
        <div className="mt-5 grid gap-3">
          {savedDomains.length ? (
            savedDomains.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
                <div>
                  <Link className="font-semibold hover:text-mint" href={`/domains/${item.domain}`}>
                    {item.domain}
                  </Link>
                  <p className="mt-1 text-xs text-ink/52">{new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
                <button
                  className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold hover:border-coral hover:text-coral disabled:opacity-55"
                  disabled={loading === item.id}
                  onClick={() => removeWatch(item)}
                  type="button"
                >
                  {loading === item.id ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="rounded-md bg-paper p-3 text-sm text-ink/62">No watched domains yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-panel">
        <h2 className="text-2xl font-bold">Search alerts</h2>
        <div className="mt-5 grid gap-3">
          {searchAlerts.length ? (
            searchAlerts.map((alert) => (
              <div key={alert.id} className="rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{alert.name}</p>
                    <p className="mt-1 text-xs text-ink/52">
                      {alert.cadence} · {alert.active ? "active" : "paused"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold hover:border-mint hover:text-mint disabled:opacity-55"
                      disabled={loading === alert.id}
                      onClick={() => toggleAlert(alert)}
                      type="button"
                    >
                      {loading === alert.id ? <Loader2 className="animate-spin" size={15} /> : alert.active ? <BellOff size={15} /> : <BellRing size={15} />}
                      {alert.active ? "Pause" : "Enable"}
                    </button>
                    <button
                      className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold hover:border-coral hover:text-coral disabled:opacity-55"
                      disabled={loading === alert.id}
                      onClick={() => removeAlert(alert)}
                      type="button"
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-md bg-paper p-2 text-xs text-ink/62">
                  {JSON.stringify(alert.filters, null, 2)}
                </pre>
              </div>
            ))
          ) : (
            <p className="rounded-md bg-paper p-3 text-sm text-ink/62">No search alerts yet.</p>
          )}
        </div>
      </section>
      {message ? <p className="rounded-md bg-paper p-3 text-sm text-ink/72 lg:col-span-2">{message}</p> : null}
    </div>
  );
}
