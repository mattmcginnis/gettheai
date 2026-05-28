"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "app.error",
      metadata: {
        message: error.message,
        digest: error.digest
      }
    }));
  }, [error]);

  return (
    <main className="min-h-[70vh] bg-paper py-16">
      <div className="shell max-w-xl rounded-md border border-line bg-white p-6 shadow-panel">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-coral" size={20} aria-hidden="true" />
          <h1 className="text-2xl font-bold">Something needs attention</h1>
        </div>
        <p className="mt-3 text-sm leading-6 text-ink/64">
          The request failed and has been logged with a diagnostic digest.
        </p>
        <button className="focus-ring mt-5 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-mint" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
