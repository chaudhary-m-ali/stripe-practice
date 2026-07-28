import { NextResponse } from "next/server";
import { baseUrl, stripe } from "@/lib/stripe";
import { isBillingInterval, PREMIUM_PLANS } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";

/**
 * Starts a SUBSCRIPTION Checkout Session (mode: "subscription" — the one-off
 * demo uses mode: "payment").
 *
 * The browser sends only "monthly" or "yearly"; the price id and amount are
 * resolved server-side from lib/plans.ts.
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

    const plan = PREMIUM_PLANS[interval];
    const customerId = await getOrCreateStripeCustomer(user);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${baseUrl()}/account?checkout=success`,
      cancel_url: `${baseUrl()}/#pricing`,
      // Both of these come back on the webhook event. client_reference_id is
      // the belt, subscription metadata is the braces — either one lets the
      // webhook map the subscription to a Supabase user.
      client_reference_id: user.id,
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan: interval },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a Checkout URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    console.error("[stripe/subscribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
