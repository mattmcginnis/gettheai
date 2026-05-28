"use client";

import { useState } from "react";
import { Bell, Loader2, Save } from "lucide-react";
import type { NotificationPreferences } from "@/lib/types";

const preferenceLabels: Array<{ key: keyof NotificationPreferences; label: string; detail: string }> = [
  { key: "instantAlerts", label: "Instant alerts", detail: "Send matches for instant saved searches." },
  { key: "dailyDigest", label: "Daily digest", detail: "Bundle matched searches once per day." },
  { key: "weeklyDigest", label: "Weekly digest", detail: "Send a weekly marketplace summary." },
  { key: "offerUpdates", label: "Offer updates", detail: "Notify me when offers change." },
  { key: "transactionUpdates", label: "Transaction updates", detail: "Notify me when escrow or transfer steps change." },
  { key: "supportUpdates", label: "Support updates", detail: "Notify me when support cases change." }
];

export function NotificationPreferencesPanel({
  email,
  preferences
}: {
  email: string;
  preferences: NotificationPreferences;
}) {
  const [current, setCurrent] = useState(preferences);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setLoading(true);
    setMessage("");

    const response = await fetch("/account/notifications", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ preferences: current })
    });
    const payload = await response.json();

    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to save notification preferences.");
      return;
    }

    setCurrent(payload.preferences);
    setMessage(`Notification preferences saved for ${email}.`);
  }

  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Bell className="text-sky" size={20} aria-hidden="true" />
        <h2 className="text-xl font-bold">Notification preferences</h2>
      </div>
      <div className="mt-5 grid gap-3">
        {preferenceLabels.map((preference) => (
          <label key={preference.key} className="flex items-start gap-3 rounded-md border border-line p-3">
            <input
              checked={current[preference.key]}
              className="mt-1 size-4 accent-mint"
              onChange={(event) => setCurrent((value) => ({ ...value, [preference.key]: event.target.checked }))}
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-semibold">{preference.label}</span>
              <span className="mt-1 block text-xs leading-5 text-ink/55">{preference.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <button
        className="focus-ring mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint disabled:opacity-55"
        disabled={loading}
        onClick={save}
        type="button"
      >
        {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
        Save preferences
      </button>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}
