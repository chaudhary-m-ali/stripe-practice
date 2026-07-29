"use client";

import { useState } from "react";

/**
 * The trial button's replacement once a trial is running: opens a Setup-mode
 * Checkout Session, which saves a card without charging it.
 */
export function AddPaymentMethodButton({
  children = "Add payment method",
  className = "bg-indigo-600 text-white hover:bg-indigo-500",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/payment-method", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not open the card form");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`w-full rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${className}`}
      >
        {loading ? "Opening…" : children}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </>
  );
}
