import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { syncSubscription } from "@/lib/sync-subscription";

/**
 * The single source of truth for subscription state.
 *
 * The redirect back to /account can be lost — the buyer closes the tab, the
 * network drops — so it is NOT a reliable signal. More importantly, renewals,
 * failed cards and cancellations happen days or months later with no browser
 * involved at all. Only the webhook sees those.
 *
 * Run locally:
 *   stripe listen --forward-to localhost:3000/api/webhook
 * and put the printed `whsec_...` into STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Catch a missing, placeholder or mistyped secret here, where the message can
  // say so. Otherwise it surfaces as a generic 400 from the signature check and
  // looks like Stripe's fault. A truncated copy-paste is the classic cause —
  // the secret is `whsec_` plus 64 hex characters, 70 in total.
  if (!secret || !/^whsec_[0-9a-zA-Z]{32,}$/.test(secret)) {
    const detail = !secret
      ? "it is not set"
      : secret.startsWith("paste_")
        ? "it is still the placeholder from .env.local.example"
        : `it does not look like a signing secret (got ${secret.length} characters, expected 70 starting with "whsec_")`;

    console.error(`[webhook] STRIPE_WEBHOOK_SECRET problem — ${detail}`);
    return NextResponse.json(
      { error: `STRIPE_WEBHOOK_SECRET problem — ${detail}` },
      { status: 500 },
    );
  }

  // The signature is computed over the EXACT raw bytes, so read text(), never
  // json() — parsing and re-serialising would change the payload.
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      secret,
    );
  } catch (error) {
    // A failed signature check means the request did not come from Stripe —
    // or, far more often in development, that STRIPE_WEBHOOK_SECRET doesn't
    // match the one `stripe listen` printed.
    const message = error instanceof Error ? error.message : "Invalid payload";
    console.error(
      "[webhook] signature verification failed:",
      message,
      "\n         → check STRIPE_WEBHOOK_SECRET matches the whsec_… from `stripe listen`, and restart the dev server",
    );
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      // Fires the moment someone finishes Checkout. The Subscription object is
      // only an id here, so fetch the full thing.
      case "checkout.session.completed": {
        const session = event.data.object;

        // A card added during a free trial — mode: "setup", no payment.
        if (session.mode === "setup") {
          await attachTrialPaymentMethod(session);
          break;
        }

        if (session.mode !== "subscription" || !session.subscription) {
          console.log(`ℹ️  One-off checkout completed — ${session.id}`);
          break;
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;

        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);

        await syncSubscription(subscription, session.client_reference_id);
        break;
      }

      // Renewals, plan switches, cancellations, card failures — all land here.
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object, null);
        break;
      }

      default:
        console.log(`ℹ️  Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handler failed";
    console.error(`[webhook] ${event.type} failed:`, message);
    // Returning 500 makes Stripe retry with backoff — better than silently
    // losing the event when the database is briefly unreachable.
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Always 2xx quickly, or Stripe will retry the delivery.
  return NextResponse.json({ received: true });
}

/**
 * Finish "Add payment method" during a free trial.
 *
 * The trial subscription was created with no card at all, so Stripe is set to
 * cancel it on day 14. A Setup session collects a card without charging it;
 * this makes that card the subscription's default, which is what turns
 * "cancel at trial end" into "charge at trial end".
 *
 * Attaching it to the customer's invoice settings too means the Billing Portal
 * and any future subscription see the same card.
 */
async function attachTrialPaymentMethod(session: Stripe.Checkout.Session) {
  const setupIntentId =
    typeof session.setup_intent === "string"
      ? session.setup_intent
      : session.setup_intent?.id;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (!setupIntentId || !customerId) {
    console.warn(`[webhook] setup session ${session.id} has no intent/customer`);
    return;
  }

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id;

  if (!paymentMethodId) {
    console.warn(`[webhook] setup intent ${setupIntentId} saved no card`);
    return;
  }

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  // Set on the Setup session by /api/stripe/payment-method.
  const subscriptionId = session.metadata?.subscription_id;
  if (!subscriptionId) {
    console.log(`ℹ️  Card saved for ${customerId}, no subscription to attach`);
    return;
  }

  const subscription = await stripe.subscriptions.update(subscriptionId, {
    default_payment_method: paymentMethodId,
  });

  // Write has_payment_method through immediately — the account page renders
  // right after the redirect back, and `customer.subscription.updated` may
  // not have landed yet.
  await syncSubscription(subscription, null);

  console.log(`💳 ${paymentMethodId} attached to ${subscriptionId}`);
}
