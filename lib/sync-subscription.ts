import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { intervalForPriceId } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Write a Stripe subscription into Supabase, creating or updating the row.
 *
 * Lives here rather than in the webhook because two callers need it:
 *
 *  - app/api/webhook — the source of truth, and the only thing that sees
 *    renewals, cancellations and trials ending.
 *  - app/api/stripe/trial — a card-less trial creates the subscription
 *    server-side and then redirects straight to /premium, which reads this
 *    table. Waiting for the webhook to race the redirect would mean landing on
 *    "you're on the free plan" a second after starting a trial.
 *
 * Both paths are upserts on stripe_subscription_id, so whichever arrives
 * second simply overwrites with the same truth.
 */
export async function syncSubscription(
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
    // Don't throw — a subscription created by hand in the Dashboard has no
    // Supabase user, and retrying forever wouldn't help.
    console.warn(
      `[sync] no Supabase user for subscription ${subscription.id} (customer ${customerId}) — skipping`,
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
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      has_payment_method: await hasPaymentMethod(subscription, customerId),
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
 * Whether Stripe has something to charge when the trial ends.
 *
 * A card can be attached in two places: on the subscription (what our
 * "Add payment method" Setup session does) or on the customer as their
 * invoice default (what the Billing Portal does). Either one converts the
 * trial, so both count — otherwise a user who added a card in the portal
 * would keep being nagged to add one.
 */
async function hasPaymentMethod(
  subscription: Stripe.Subscription,
  customerId: string,
): Promise<boolean> {
  if (subscription.default_payment_method) return true;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return false;
    return !!customer.invoice_settings?.default_payment_method;
  } catch (error) {
    // Not worth failing the whole sync over — worst case the UI offers to add
    // a card that's already there.
    console.warn(
      "[sync] could not read customer payment method:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
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
  // 1. Set by us in subscription_data.metadata at checkout, or in metadata
  //    when the trial subscription is created.
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
