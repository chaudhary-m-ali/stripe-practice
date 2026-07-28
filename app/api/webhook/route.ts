import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { intervalForPriceId } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";

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

/** Write the Stripe subscription into Supabase, creating or updating the row. */
async function syncSubscription(
  subscription: Stripe.Subscription,
  clientReferenceId: string | null,
) {
  const admin = createAdminClient();

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const userId = await resolveUserId(subscription, clientReferenceId, customerId);

  if (!userId) {
    // Don't 500 — a subscription created by hand in the Dashboard has no
    // Supabase user, and retrying forever wouldn't help.
    console.warn(
      `[webhook] no Supabase user for subscription ${subscription.id} (customer ${customerId}) — skipping`,
    );
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;

  // In API version 2026-06-24 current_period_end moved OFF the subscription
  // and onto each subscription item. Most tutorials still read
  // `subscription.current_period_end`, which is undefined on this version.
  const periodEnd = item?.current_period_end;

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      status: subscription.status,
      price_id: priceId,
      plan: intervalForPriceId(priceId),
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log(
    `✅ ${subscription.id} → user ${userId} | status ${subscription.status} | plan ${intervalForPriceId(priceId) ?? "?"}`,
  );
}

/**
 * Work out which Supabase user a subscription belongs to. Three fallbacks,
 * because different events carry different fields.
 */
async function resolveUserId(
  subscription: Stripe.Subscription,
  clientReferenceId: string | null,
  customerId: string,
): Promise<string | null> {
  // 1. Set by us in subscription_data.metadata at checkout.
  const fromMetadata = subscription.metadata?.supabase_user_id;
  if (fromMetadata) return fromMetadata;

  // 2. Set by us as client_reference_id on the Checkout Session.
  if (clientReferenceId) return clientReferenceId;

  // 3. Look it up by customer id — covers subscriptions changed from the
  //    Billing Portal, where our metadata isn't on the event.
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}
