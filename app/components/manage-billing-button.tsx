"use client";

import { useState } from "react";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not open the billing portal");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {loading ? "Opening…" : "Manage billing"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
