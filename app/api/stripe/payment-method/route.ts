import { NextResponse } from "next/server";
import { baseUrl, stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";

/**
 * Adds a card to a running free trial — `mode: "setup"`.
 *
 * Setup mode is Checkout without a charge: same hosted card form, same 3D
 * Secure, but it saves the payment method instead of taking money. The trial
 * keeps running to day 14 and only then does the first invoice go out.
 *
 * The webhook does the attaching (checkout.session.completed → mode "setup"),
 * because this redirect can be lost.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription) {
      return NextResponse.json(
        { error: "No active subscription to add a card to" },
        { status: 404 },
      );
    }

    const customerId = await getOrCreateStripeCustomer(user);

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      currency: "usd",
      success_url: `${baseUrl()}/account?card=added`,
      cancel_url: `${baseUrl()}/account`,
      // Read back by the webhook to know which subscription to attach to.
      metadata: {
        supabase_user_id: user.id,
        subscription_id: subscription.stripe_subscription_id as string,
      },
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
    console.error("[stripe/payment-method]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
