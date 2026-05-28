"use client";

import { useState } from "react";
import { Archive, CheckCircle2, EyeOff, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/appraisal";
import type { SellerInventoryItem } from "@/lib/types";

export function SellerInventoryPanel({ inventory }: { inventory: SellerInventoryItem[] }) {
  const [items, setItems] = useState(inventory);
  const [message, setMessage] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function updateStatus(listingId: string, status: "draft" | "active" | "archived") {
    setLoadingId(`${listingId}:${status}`);
    setMessage("");

    const response = await fetch(`/listings/${encodeURIComponent(listingId)}/status`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ status })
    });
    const payload = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Listing status update failed.");
      return;
    }

    setItems((current) =>
      current.map((item) => (item.id === listingId ? { ...item, status: payload.listing.status } : item))
    );
    setMessage(`${payload.listing.domain} moved to ${payload.listing.status.replaceAll("_", " ")}.`);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Inventory management</h2>
          <p className="mt-2 text-sm leading-6 text-ink/62">
            Publish verified names, pause listings as drafts, and archive stale inventory.
          </p>
        </div>
        <span className="rounded-md bg-paper px-3 py-1 text-sm font-bold text-ink/60">{items.length} listings</span>
      </div>

      <div className="mt-5 overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink/50">
            <tr>
              <th className="px-3 py-2 font-bold">Domain</th>
              <th className="px-3 py-2 font-bold">Ask</th>
              <th className="px-3 py-2 font-bold">Status</th>
              <th className="px-3 py-2 font-bold">Offers</th>
              <th className="px-3 py-2 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-line align-top">
                <td className="px-3 py-3">
                  <p className="font-semibold">{item.domain}</p>
                  <p className="mt-1 text-xs text-ink/52">
                    {item.listingType.replaceAll("_", " ")} · {item.verificationStatus}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold">{formatMoney(item.price)}</p>
                  <p className="mt-1 text-xs text-ink/52">Min {formatMoney(item.minimumOffer)}</p>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-md bg-paper px-2.5 py-1 text-xs font-bold uppercase text-ink/58">
                    {item.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="px-3 py-3 text-ink/68">
                  {item.openOfferCount} open · {item.offerCount} total
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <InventoryButton
                      label="Publish"
                      icon={<CheckCircle2 size={15} />}
                      loading={loadingId === `${item.id}:active`}
                      disabled={item.status === "active" || !item.ownershipVerified}
                      onClick={() => updateStatus(item.id, "active")}
                    />
                    <InventoryButton
                      label="Draft"
                      icon={<EyeOff size={15} />}
                      loading={loadingId === `${item.id}:draft`}
                      disabled={item.status === "draft"}
                      onClick={() => updateStatus(item.id, "draft")}
                    />
                    <InventoryButton
                      label="Archive"
                      icon={<Archive size={15} />}
                      loading={loadingId === `${item.id}:archived`}
                      disabled={item.status === "archived"}
                      onClick={() => updateStatus(item.id, "archived")}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}

function InventoryButton({
  label,
  icon,
  loading,
  disabled,
  onClick
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:border-mint hover:text-mint disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled || loading}
      onClick={onClick}
      type="button"
    >
      {loading ? <Loader2 className="animate-spin" size={15} /> : icon}
      {label}
    </button>
  );
}
