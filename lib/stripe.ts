import Stripe from "stripe";

// Server-side Stripe client. The secret key must NEVER reach the browser,
// so this module is only ever imported from Route Handlers / Server Components.
const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY is missing. Copy .env.local.example to .env.local and paste your test keys from https://dashboard.stripe.com/test/apikeys",
  );
}

export const stripe = new Stripe(secretKey, {
  // Pinning the API version means Stripe's future changes can't break this app.
  apiVersion: "2026-06-24.dahlia",
  typescript: true,
  appInfo: { name: "stripe-practice" },
});

/** Absolute base URL used for Checkout success/cancel redirects. */
export function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}
