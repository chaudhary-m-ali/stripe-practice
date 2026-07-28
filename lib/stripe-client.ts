import { loadStripe, type Stripe } from "@stripe/stripe-js";

// loadStripe injects Stripe.js into the page. Call it once per app, outside of
// any render, so the script isn't re-fetched on every re-render.
let stripePromise: Promise<Stripe | null>;

export function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string,
    );
  }
  return stripePromise;
}
