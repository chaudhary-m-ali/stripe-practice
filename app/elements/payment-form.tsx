"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe-client";

const stripePromise = getStripe();

export function PaymentForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — ask our own server for a PaymentIntent. Its client_secret is
  // scoped to this one payment, so it's safe to expose to the browser.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    })
      .then(async (res) => {
        // The intent is stamped with the buyer's user id, so a signed-out
        // request has nothing to stamp it with.
        if (res.status === 401) {
          router.push(`/login?next=${encodeURIComponent("/elements")}`);
          return;
        }

        const data = (await res.json()) as {
          clientSecret?: string;
          error?: string;
        };
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error ?? "Could not create PaymentIntent");
        }
        if (!cancelled) setClientSecret(data.clientSecret);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [productId, router]);

  if (error) {
    return (
      <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (!clientSecret) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-zinc-200 dark:border-zinc-800" />
    );
  }

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: { theme: "stripe", variables: { colorPrimary: "#4f46e5" } },
  };

  // Step 2 — <Elements> loads Stripe.js and mounts the secure iframes.
  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutForm />
    </Elements>
  );
}

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Null until Stripe.js has finished loading.
    if (!stripe || !elements) return;

    setSubmitting(true);
    setMessage(null);

    // Step 3 — confirm. Stripe validates the fields, handles 3D Secure, and
    // either resolves here or redirects to return_url for methods that need it.
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment-status`,
      },
      // Stay on this page when the payment method doesn't require a redirect.
      redirect: "if_required",
    });

    if (error) {
      // card_error / validation_error are safe to show the buyer verbatim.
      setMessage(error.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      setSucceeded(true);
      setMessage(`Paid. PaymentIntent ${paymentIntent.id} succeeded.`);
    } else {
      setMessage(`PaymentIntent status: ${paymentIntent?.status ?? "unknown"}`);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <PaymentElement options={{ layout: "tabs" }} />

      <button
        type="submit"
        disabled={!stripe || submitting || succeeded}
        className="rounded-full bg-indigo-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {succeeded ? "Paid" : submitting ? "Processing…" : "Pay now"}
      </button>

      {message ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            succeeded
              ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          <p>{message}</p>
          {succeeded ? (
            // The row appears via payment_intent.succeeded, not from here.
            <Link href="/orders" className="mt-1 inline-block underline">
              See it in your orders
            </Link>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
