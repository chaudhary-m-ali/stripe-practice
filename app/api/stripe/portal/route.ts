import { NextResponse } from "next/server";
import { baseUrl, stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";

/**
 * Stripe's hosted Billing Portal — upgrade, downgrade, cancel, update card,
 * download invoices. You get all of it without building any of it.
 *
 * Test mode needs the portal configured once:
 * https://dashboard.stripe.com/test/settings/billing/portal
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

    const customerId = await getOrCreateStripeCustomer(user);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl()}/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    console.error("[stripe/portal]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
