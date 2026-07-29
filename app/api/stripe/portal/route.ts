import { NextResponse } from "next/server";
import { baseUrl, customerPortalUrl, stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";

/**
 * Stripe's hosted Billing Portal — upgrade, downgrade, cancel, update card,
 * download invoices. You get all of it without building any of it.
 *
 * Two ways in, tried in this order:
 *
 *  1. billingPortal.sessions.create() — a URL minted for THIS customer that
 *     opens straight into their billing. No email, no second step. Needs the
 *     portal configured once:
 *     https://dashboard.stripe.com/test/settings/billing/portal
 *
 *  2. NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL — the no-code login page, shared
 *     by every customer, which emails them a magic link. Only used when (1)
 *     fails, so an unconfigured portal degrades into "one extra step" instead
 *     of a red error message.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const customerId = await getOrCreateStripeCustomer(user);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl()}/account`,
    });

    return NextResponse.json({ url: session.url, via: "session" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    console.error("[stripe/portal]", message);

    const fallback = customerPortalUrl();
    if (fallback) {
      console.warn(
        "[stripe/portal] falling back to the no-code login link — the customer will have to enter their email",
      );
      return NextResponse.json({ url: fallback, via: "login_link" });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
