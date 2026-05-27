"use client";

import { useState } from "react";
import { BadgeDollarSign, Loader2, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/lib/appraisal";
import type { DomainListing, Transaction, VerificationTier } from "@/lib/types";

export function OfferPanel({ listing }: { listing: DomainListing }) {
  const [email, setEmail] = useState("buyer@example.com");
  const [amount, setAmount] = useState(listing.minimumOffer);
  const [tier, setTier] = useState<VerificationTier>("two_factor");
  const [message, setMessage] = useState("");
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState<"offer" | "buy" | null>(null);

  async function makeOffer() {
    setLoading("offer");
    setMessage("");

    const response = await fetch("/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listingId: listing.id,
        buyerEmail: email,
        amount,
        buyerVerificationTier: tier
      })
    });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Offer could not be created.");
      return;
    }

    setMessage(`Offer ${payload.offer.id} created and expires ${new Date(payload.offer.expiresAt).toLocaleDateString()}.`);
  }

  async function buyNow() {
    setLoading("buy");
    setMessage("");

    const response = await fetch("/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listingId: listing.id,
        buyerEmail: email
      })
    });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Transaction could not be started.");
      return;
    }

    setTransaction(payload.transaction);
    setMessage("Escrow.com handoff created.");
  }

  return (
    <section className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <BadgeDollarSign className="text-mint" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Checkout</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink/66">
        GetThe records the marketplace transaction and sends funds through Escrow.com.
      </p>

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
          Offer amount
          <input className="focus-ring h-11 rounded-md border border-line px-3" value={amount} type="number" min={listing.minimumOffer} onChange={(event) => setAmount(Number(event.target.value))} />
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:border-mint hover:text-mint" onClick={makeOffer} disabled={loading !== null}>
          {loading === "offer" ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
          Make offer
        </button>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint" onClick={buyNow} disabled={loading !== null}>
          {loading === "buy" ? <Loader2 className="animate-spin" size={16} /> : <BadgeDollarSign size={16} />}
          Buy {formatMoney(listing.price)}
        </button>
      </div>

      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}

      {transaction ? (
        <a className="focus-ring mt-4 inline-flex rounded-md bg-gold px-4 py-2 text-sm font-semibold text-white" href={transaction.escrowUrl} target="_blank" rel="noreferrer">
          Open Escrow.com handoff
        </a>
      ) : null}
    </section>
  );
}
