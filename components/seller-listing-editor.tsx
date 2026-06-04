"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import type { DomainListing, ListingType } from "@/lib/types";

type ListingForm = {
  price: number;
  minimumOffer: number;
  registrar: string;
  category: string;
  listingType: ListingType;
  description: string;
  trafficMonthly: number;
  domainAgeYears: number;
  seoTitle: string;
  seoDescription: string;
};

export function SellerListingEditor({ listings }: { listings: DomainListing[] }) {
  const [items, setItems] = useState(listings);
  const [selectedId, setSelectedId] = useState(listings[0]?.id ?? "");
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? items[0], [items, selectedId]);
  const [form, setForm] = useState<ListingForm>(() => toForm(selected));
  const [loading, setLoading] = useState<"save" | "delete" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm(toForm(selected));
  }, [selected]);

  async function save() {
    if (!selected) return;
    setLoading("save");
    setMessage("");

    const response = await fetch(`/listings/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Listing update failed.");
      return;
    }

    setItems((current) => current.map((item) => (item.id === selected.id ? payload.listing : item)));
    setMessage(`${payload.listing.domain} updated.`);
  }

  async function remove() {
    if (!selected) return;
    setLoading("delete");
    setMessage("");

    const response = await fetch(`/listings/${encodeURIComponent(selected.id)}`, {
      method: "DELETE"
    });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Listing delete failed.");
      return;
    }

    if (payload.deleted) {
      const nextItems = items.filter((item) => item.id !== selected.id);
      setItems(nextItems);
      setSelectedId(nextItems[0]?.id ?? "");
    } else {
      setItems((current) =>
        current.map((item) => (item.id === selected.id ? { ...item, status: "archived" } : item))
      );
    }
    setMessage(payload.deleted ? "Listing deleted." : "Listing archived to preserve transaction history.");
  }

  if (!selected) {
    return (
      <div className="rounded-md border border-line bg-white p-5 shadow-panel">
        <h2 className="text-xl font-bold">Listing editor</h2>
        <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/62">Create a listing before editing inventory details.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Listing editor</h2>
          <p className="mt-2 text-sm leading-6 text-ink/62">{selected.domain}</p>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Domain
          <select
            className="focus-ring h-11 rounded-md border border-line px-3"
            value={selected.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.domain}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <NumberField label="Buy-now price" value={form.price} onChange={(value) => setForm({ ...form, price: value })} />
        <NumberField label="Minimum offer" value={form.minimumOffer} onChange={(value) => setForm({ ...form, minimumOffer: value })} />
        <TextField label="Registrar" value={form.registrar} onChange={(value) => setForm({ ...form, registrar: value })} />
        <TextField label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
        <label className="grid gap-1 text-sm font-medium">
          Listing type
          <select
            className="focus-ring h-11 rounded-md border border-line px-3"
            value={form.listingType}
            onChange={(event) => setForm({ ...form, listingType: event.target.value as ListingType })}
          >
            <option value="buy_now">buy now</option>
            <option value="make_offer">make offer</option>
            <option value="buy_now_and_offer">buy now and offer</option>
            <option value="auction">auction</option>
          </select>
        </label>
        <NumberField label="Monthly traffic" value={form.trafficMonthly} onChange={(value) => setForm({ ...form, trafficMonthly: value })} />
        <NumberField label="Domain age" value={form.domainAgeYears} onChange={(value) => setForm({ ...form, domainAgeYears: value })} />
        <TextField label="SEO title" value={form.seoTitle} onChange={(value) => setForm({ ...form, seoTitle: value })} />
        <label className="grid gap-1 text-sm font-medium md:col-span-2">
          Description
          <textarea
            className="focus-ring min-h-28 rounded-md border border-line p-3"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium md:col-span-2">
          SEO description
          <textarea
            className="focus-ring min-h-24 rounded-md border border-line p-3"
            value={form.seoDescription}
            onChange={(event) => setForm({ ...form, seoDescription: event.target.value })}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint disabled:opacity-55"
          disabled={Boolean(loading)}
          onClick={save}
          type="button"
        >
          {loading === "save" ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Save listing
        </button>
        <button
          className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:border-coral hover:text-coral disabled:opacity-55"
          disabled={Boolean(loading)}
          onClick={remove}
          type="button"
        >
          {loading === "delete" ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
          Delete
        </button>
      </div>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input className="focus-ring h-11 rounded-md border border-line px-3" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input
        className="focus-ring h-11 rounded-md border border-line px-3"
        min={0}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function toForm(listing: DomainListing | undefined): ListingForm {
  return {
    price: listing?.price ?? 0,
    minimumOffer: listing?.minimumOffer ?? 0,
    registrar: listing?.registrar ?? "",
    category: listing?.category ?? "",
    listingType: listing?.listingType ?? "buy_now_and_offer",
    description: listing?.description ?? "",
    trafficMonthly: listing?.trafficMonthly ?? 0,
    domainAgeYears: listing?.domainAgeYears ?? 0,
    seoTitle: listing?.seoTitle ?? "",
    seoDescription: listing?.seoDescription ?? ""
  };
}
