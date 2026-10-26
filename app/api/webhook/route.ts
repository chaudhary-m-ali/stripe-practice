import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  markOrderRefunded,
  recordOrderFromPaymentIntent,
  recordOrderFromSession,
} from "@/lib/fulfil-order";
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

  // One line per delivery, before any branching — so the log shows every event
  // Stripe sent, including the ones that fall through to `default`.
  console.log(
    `\n🔔 [webhook] ${event.type} — event ${event.id}, ${event.livemode ? "LIVE" : "test"} mode`,
  );

  try {
    switch (event.type) {
      // Fires the moment someone finishes Checkout. The Subscription object is
      // only an id here, so fetch the full thing.
      case "checkout.session.completed": {
        const session = event.data.object;

        console.log(
          `   ↳ Checkout finished. session=${session.id} mode=${session.mode} status=${session.status}` +
            ` payment_status=${session.payment_status} amount_total=${session.amount_total}` +
            ` currency=${session.currency} customer=${
              typeof session.customer === "string"
                ? session.customer
                : (session.customer?.id ?? "none")
            } client_reference_id=${session.client_reference_id ?? "none"}`,
        );

        // A card added during a free trial — mode: "setup", no payment.
        if (session.mode === "setup") {
          console.log(
            `   ↳ mode=setup → no charge; a card was collected during a trial. Attaching it as the default payment method.`,
          );
          await attachTrialPaymentMethod(session);
          break;
        }

        // A one-off purchase — mode: "payment". THIS is where an order gets
        // fulfilled, not on the /success redirect, which the buyer can close.
        if (session.mode === "payment") {
          console.log(
            `   ↳ mode=payment → one-off purchase. Recording the order from the session (this is the real fulfilment point, not the /success redirect).`,
          );
          await recordOrderFromSession(session);
          break;
        }

        if (session.mode !== "subscription" || !session.subscription) {
          console.log(`ℹ️  Checkout session ${session.id} has nothing to sync`);
          break;
        }

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;

        console.log(
          `   ↳ mode=subscription → the session only carries the subscription id (${subscriptionId}), so fetching the full object from Stripe before syncing.`,
        );

        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);

        console.log(
          `   ↳ fetched subscription ${subscription.id} status=${subscription.status} → writing it to our database`,
        );

        await syncSubscription(subscription, session.client_reference_id);
        break;
      }

      // Renewals, plan switches, cancellations, card failures — all land here.
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        console.log(
          `   ↳ Subscription lifecycle event. subscription=${subscription.id}` +
            ` status=${subscription.status}` +
            ` cancel_at_period_end=${subscription.cancel_at_period_end}` +
            ` customer=${
              typeof subscription.customer === "string"
                ? subscription.customer
                : subscription.customer.id
            }` +
            ` price=${subscription.items.data[0]?.price.id ?? "none"}`,
        );
        console.log(
          `   ↳ Overwriting our stored copy of this subscription so the account page matches Stripe. Renewals, plan switches, card failures and cancellations all arrive here — days or months later, with no browser involved.`,
        );

        await syncSubscription(subscription, null);
        break;
      }

      // The embedded Payment Element never creates a Checkout Session, so the
      // event above never fires for it — this is its only signal.
      //
      // It ALSO fires for hosted Checkout payments, which means one purchase
      // there produces two events. Both write the same row keyed on the same
      // PaymentIntent id, in whichever order they arrive, so the duplicate is
      // harmless. That is the entire reason for the unique constraint.
      case "payment_intent.succeeded": {
        const intent = event.data.object;

        console.log(
          `   ↳ Payment succeeded. payment_intent=${intent.id}` +
            ` amount=${intent.amount} ${intent.currency}` +
            ` customer=${
              typeof intent.customer === "string"
                ? intent.customer
                : (intent.customer?.id ?? "none")
            }` +
            ` metadata=${JSON.stringify(intent.metadata)}`,
        );
        console.log(
          `   ↳ Recording the order as "paid", keyed on the PaymentIntent id. A hosted Checkout purchase also fires checkout.session.completed, so this row may be written twice — the unique constraint makes that harmless.`,
        );

        await recordOrderFromPaymentIntent(intent, "paid");
        break;
      }

      // Test card 4000 0000 0000 9995 lands here.
      case "payment_intent.payment_failed": {
        const intent = event.data.object;

        console.log(
          `   ↳ Payment failed. payment_intent=${intent.id}` +
            ` amount=${intent.amount} ${intent.currency}` +
            ` code=${intent.last_payment_error?.code ?? "none"}` +
            ` decline_code=${intent.last_payment_error?.decline_code ?? "none"}` +
            ` message=${intent.last_payment_error?.message ?? "none"}`,
        );
        console.log(
          `   ↳ Recording the order as "failed" so the buyer sees why, instead of the attempt vanishing.`,
        );

        await recordOrderFromPaymentIntent(intent, "failed");
        break;
      }

      // Refund one from the Dashboard and watch /orders change with no code of
      // ours running in between — the same argument as subscription renewals.
      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;

        console.log(
          `   ↳ Charge refunded. charge=${charge.id}` +
            ` amount=${charge.amount} refunded=${charge.amount_refunded} ${charge.currency}` +
            ` fully_refunded=${charge.refunded}` +
            ` payment_intent=${paymentIntentId ?? "none"}`,
        );

        if (paymentIntentId) {
          console.log(
            `   ↳ Marking our order refunded. Triggered from the Dashboard with none of our code in between — the same argument as subscription renewals.`,
          );
          await markOrderRefunded(paymentIntentId);
        } else {
          console.log(
            `   ↳ No PaymentIntent on this charge, so there is no order row to match. Ignoring.`,
          );
        }
        break;
      }

      default:
        console.log(
          `   ↳ ℹ️  Unhandled event type: ${event.type}. Nothing in this app reacts to it — Stripe sends it because the endpoint is subscribed to it (or \`stripe listen\` forwards everything). Still answering 2xx so Stripe does not retry.`,
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handler failed";
    console.error(`[webhook] ${event.type} failed:`, message);
    // Returning 500 makes Stripe retry with backoff — better than silently
    // losing the event when the database is briefly unreachable.
    return NextResponse.json({ error: message }, { status: 500 });
  }

  console.log(`✅ [webhook] ${event.type} handled — answering 200`);

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

  console.log(
    `      • setup session ${session.id} → setup_intent=${setupIntentId} customer=${customerId}; fetching the intent to find which card was saved`,
  );

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id;

  if (!paymentMethodId) {
    console.warn(`[webhook] setup intent ${setupIntentId} saved no card`);
    return;
  }

  console.log(
    `      • card ${paymentMethodId} saved; setting it as the customer's invoice default so the Billing Portal and future subscriptions reuse it`,
  );

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  // Set on the Setup session by /api/stripe/payment-method.
  const subscriptionId = session.metadata?.subscription_id;
  if (!subscriptionId) {
    console.log(`ℹ️  Card saved for ${customerId}, no subscription to attach`);
    return;
  }

  console.log(
    `      • attaching it to subscription ${subscriptionId} as the default — this is what turns "cancel at trial end" into "charge at trial end"`,
  );

  const subscription = await stripe.subscriptions.update(subscriptionId, {
    default_payment_method: paymentMethodId,
  });

  // Write has_payment_method through immediately — the account page renders
  // right after the redirect back, and `customer.subscription.updated` may
  // not have landed yet.
  await syncSubscription(subscription, null);

  console.log(`💳 ${paymentMethodId} attached to ${subscriptionId}`);
}