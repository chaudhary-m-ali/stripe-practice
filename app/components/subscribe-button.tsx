"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BillingInterval } from "@/lib/plans";

export function SubscribeButton({
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
    // No account yet — send them to sign up, then straight back to pricing.
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent("/#pricing")}`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the interval — never the price or the amount.
        body: JSON.stringify({ interval }),
      });
      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout");
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
        {loading ? "Redirecting…" : children}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </>
  );
}
