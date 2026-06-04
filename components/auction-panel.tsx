"use client";

import { useEffect, useState } from "react";
import { Gavel, Loader2, Timer } from "lucide-react";
import { formatMoney } from "@/lib/appraisal";
import type { AuctionState, VerificationTier } from "@/lib/types";

function timeLeft(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) {
    return "Ended";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function AuctionPanel({ auction: initial }: { auction: AuctionState }) {
  const [auction, setAuction] = useState(initial);
  const [email, setEmail] = useState("buyer@example.com");
  const [tier, setTier] = useState<VerificationTier>("two_factor");
  const [amount, setAmount] = useState(initial.minimumNextBid);
  const [remaining, setRemaining] = useState(() => timeLeft(initial.endsAt));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setRemaining(timeLeft(auction.endsAt)), 1_000);
    return () => clearInterval(id);
  }, [auction.endsAt]);

  async function submitBid() {
    setLoading(true);
    setMessage("");

    const response = await fetch(`/listings/${auction.listingId}/bids`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buyerEmail: email, amount, buyerVerificationTier: tier })
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Bid could not be placed.");
      return;
    }

    setAuction(payload.auction);
    setAmount(payload.auction.minimumNextBid);
    setMessage(
      payload.auction.highestBidderEmail === email.toLowerCase()
        ? "Bid placed — you are the current high bidder."
        : "Bid placed — you have been outbid; raise to take the lead."
    );
  }

  const ended = !auction.open;

  return (
    <section className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Gavel className="text-coral" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Live auction</h2>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="flex items-center justify-between rounded-md bg-paper p-3 text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <Timer size={16} aria-hidden="true" /> {ended ? "Auction ended" : "Time left"}
          </span>
          <span className="font-bold">{ended ? (auction.settled ? "Settled" : "Closing") : remaining}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="High bid" value={auction.highestBid != null ? formatMoney(auction.highestBid) : "No bids"} />
          <Stat label="Bids" value={String(auction.bidCount)} />
          <Stat label="Starting" value={formatMoney(auction.startingBid)} />
          <Stat label="Reserve" value={auction.reserveMet ? "Met" : "Not met"} />
        </div>
      </div>

      {auction.settled ? (
        <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">
          {auction.winnerEmail
            ? `Auction won at ${formatMoney(auction.highestBid ?? 0)}. The winner is handed off to Escrow.com.`
            : "Auction ended without a winning bid above reserve."}
        </p>
      ) : ended ? (
        <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">Bidding has closed. Settlement is in progress.</p>
      ) : (
        <>
          <div className="mt-5 grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Buyer email
              <input className="focus-ring h-11 rounded-md border border-line px-3" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Verification tier
              <select className="focus-ring h-11 rounded-md border border-line px-3" value={tier} onChange={(event) => setTier(event.target.value as VerificationTier)}>
                <option value="email">Email</option>
                <option value="two_factor">2FA</option>
                <option value="escrow_intent">Escrow intent</option>
                <option value="kyc_review">KYC review</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Your bid (min {formatMoney(auction.minimumNextBid)})
              <input
                className="focus-ring h-11 rounded-md border border-line px-3"
                type="number"
                min={auction.minimumNextBid}
                step={auction.bidIncrement}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </label>
          </div>
          <button
            className="focus-ring mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint"
            onClick={submitBid}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Gavel size={16} />}
            Place bid
          </button>
        </>
      )}

      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="text-xs font-bold uppercase text-ink/48">{label}</p>
      <p className="mt-1 text-base font-bold">{value}</p>
    </div>
  );
}
