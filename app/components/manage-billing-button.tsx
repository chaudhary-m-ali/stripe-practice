"use client";

import { useState } from "react";

export function ManageBillingButton({ email }: { email?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginLink, setLoginLink] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as {
        url?: string;
        via?: string;
        error?: string;
      };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not open the billing portal");
      }

      // The no-code login link doesn't know who's asking — it asks for an
      // email and sends a magic link. Dropping someone on that form with no
      // warning looks broken, so explain it instead of redirecting.
      if (data.via === "login_link") {
        setLoginLink(data.url);
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (loginLink) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          Opening the portal the long way round
        </p>
        <p className="mt-1 text-amber-800 dark:text-amber-300">
          The portal API isn&apos;t configured for this account, so use Stripe&apos;s
          portal login page instead. Enter{" "}
          <span className="font-mono">{email ?? "your account email"}</span> and
          Stripe emails you a link.
        </p>
        <a
          href={loginLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block rounded-full bg-amber-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
        >
          Open the portal login page →
        </a>
      </div>
    );
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
