"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatAmount, type Product } from "@/lib/products";

export function BuyButton({ product }: { product: Product }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });

      // The session expired while this page sat open. Orders are written
      // against a user id, so there's nothing to do but sign in again.
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent("/checkout")}`);
        return;
      }

      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout");
      }

      // Full-page navigation to Stripe's hosted payment page.
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Redirecting…" : `Pay ${formatAmount(product.amount, product.currency)}`}
      </button>
      {error ? (
        <p className="mt-1 max-w-40 text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
