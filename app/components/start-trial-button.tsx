"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BillingInterval } from "@/lib/plans";

/**
 * Starts the card-less trial. Unlike SubscribeButton there is no trip to
 * checkout.stripe.com — the server creates the trialing subscription and this
 * lands the user straight on /premium.
 */
export function StartTrialButton({
  interval,
  signedIn,
  children,
  className = "",
}: {
  interval: BillingInterval;
  signedIn: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent("/#pricing")}`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start the trial");
      }

      // Server-rendered pages read the subscription row, and it only just
      // appeared — refresh so the nav and pricing cards catch up too.
      router.push(data.url);
      router.refresh();
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
        {loading ? "Starting…" : children}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </>
  );
}
