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

/**
 * The no-code Customer Portal login page, if one is configured —
 * Stripe → Settings → Billing → Customer portal → "Login link".
 *
 * This is NOT the same thing as billingPortal.sessions.create(). That makes a
 * one-off URL for one known customer and opens straight into their billing.
 * This link is a single shared page: the customer types their email and Stripe
 * emails them a magic link. Worse for a signed-in user, but it needs no API
 * call and keeps working when the portal API is unconfigured — which is the
 * usual reason "Manage billing" dies in test mode.
 *
 * So: API session first, this second. Never the other way round.
 */
export function customerPortalUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL;

  // Only trust Stripe's own host — this value ends up in an href, and a
  // half-pasted or placeholder value shouldn't become a redirect somewhere else.
  return url?.startsWith("https://billing.stripe.com/p/login/") ? url : null;
}
