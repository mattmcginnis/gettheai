"use client";

import { useState } from "react";
import { BellPlus, BookmarkPlus, Loader2 } from "lucide-react";

export function BuyerActions({ defaultListingId }: { defaultListingId: string }) {
  const [userEmail, setUserEmail] = useState("buyer@example.com");
  const [listingId, setListingId] = useState(defaultListingId);
  const [query, setQuery] = useState("ai");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"watchlist" | "alert" | null>(null);

  async function addWatchlist() {
    setLoading("watchlist");
    const response = await fetch("/watchlist", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "buyer"
      },
      body: JSON.stringify({ userEmail, listingId })
    });
    const payload = await response.json();
    setLoading(null);
    setMessage(response.ok ? `${payload.watchlistItem.domain} saved to watchlist.` : payload.error);
  }

  async function createAlert() {
    setLoading("alert");
    const response = await fetch("/search-alerts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-getthe-role": "buyer"
      },
      body: JSON.stringify({
        userEmail,
        name: `${query} domain alert`,
        filters: { q: query },
        cadence: "weekly"
      })
    });
    const payload = await response.json();
    setLoading(null);
    setMessage(response.ok ? `${payload.searchAlert.name} created.` : payload.error);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <h2 className="text-xl font-bold">Buyer actions</h2>
      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Buyer email
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Listing ID or domain
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={listingId} onChange={(event) => setListingId(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Alert keyword
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:border-mint hover:text-mint" onClick={addWatchlist}>
          {loading === "watchlist" ? <Loader2 className="animate-spin" size={16} /> : <BookmarkPlus size={16} />}
          Watch
        </button>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint" onClick={createAlert}>
          {loading === "alert" ? <Loader2 className="animate-spin" size={16} /> : <BellPlus size={16} />}
          Alert
        </button>
      </div>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}
