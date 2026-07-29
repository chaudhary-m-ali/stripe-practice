import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { isBillingInterval, PREMIUM_PLANS, TRIAL_DAYS } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";
import { syncSubscription } from "@/lib/sync-subscription";

/**
 * Starts a 14-day free trial with NO card.
 *
 * Note what's missing: there is no Checkout Session here. Checkout exists to
 * collect a payment method, and we deliberately don't want one — so the
 * subscription is created directly against the API and the user goes straight
 * to /premium.
 *
 * The trial can still end itself. `missing_payment_method: "cancel"` tells
 * Stripe what to do on day 14 when there's nothing to charge: cancel the
 * subscription. That fires customer.subscription.updated, the webhook writes
 * status "canceled", and /premium locks — no cron job of ours involved.
 *
 * Eligibility is checked server-side, twice: `profiles.trial_started_at` (one
 * trial per account, forever) and the absence of a live subscription. The
 * browser sends nothing but "monthly" or "yearly".
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { interval } = (await request.json()) as { interval?: string };
    if (!isBillingInterval(interval)) {
      return NextResponse.json(
        { error: "interval must be 'monthly' or 'yearly'" },
        { status: 400 },
      );
    }

    // Service role: `profiles` is read-only to the user, so trial_started_at
    // can't be cleared from devtools to farm unlimited trials.
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("trial_started_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.trial_started_at) {
      return NextResponse.json(
        { error: "This account has already used its free trial" },
        { status: 409 },
      );
    }

    const { data: existing } = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "This account already has a subscription" },
        { status: 409 },
      );
    }

    const plan = PREMIUM_PLANS[interval];
    const customerId = await getOrCreateStripeCustomer(user);

    // Claim the trial BEFORE creating it. If two clicks race, the second one
    // fails this write and never reaches Stripe — better than two
    // subscriptions on one account.
    const { error: claimError } = await admin
      .from("profiles")
      .update({ trial_started_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("trial_started_at", null);

    if (claimError) {
      throw new Error(`Could not claim the trial: ${claimError.message}`);
    }

    let subscription;
    try {
      subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: plan.priceId, quantity: 1 }],
        trial_period_days: TRIAL_DAYS,
        // Without this Stripe refuses to start a trial on a customer with no
        // payment method — it has no idea what to do when the trial ends.
        trial_settings: {
          end_behavior: { missing_payment_method: "cancel" },
        },
        // If a card does get added mid-trial, save it as the default so the
        // renewal has something to charge.
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        metadata: { supabase_user_id: user.id, plan: interval },
      });
    } catch (error) {
      // Hand the trial back, or a Stripe outage would burn it permanently.
      await admin
        .from("profiles")
        .update({ trial_started_at: null })
        .eq("id", user.id);
      throw error;
    }

    // The webhook will send this again in a moment. Writing it here as well is
    // what lets the redirect below land on an unlocked /premium instead of
    // racing the event.
    await syncSubscription(subscription, user.id);

    return NextResponse.json({ url: "/premium?trial=started" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    console.error("[stripe/trial]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
