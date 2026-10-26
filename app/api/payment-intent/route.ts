import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getProduct } from "@/lib/products";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";
import { createClient } from "@/lib/supabase/server";

/**
 * FLOW 2 — Payment Element (embedded).
 *
 * A PaymentIntent is Stripe's object for "collect this much money, once".
 * We create it server-side and return only its `client_secret`, which lets the
 * browser confirm THAT ONE intent and nothing else. The secret key stays here.
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

    const { productId } = (await request.json()) as { productId?: string };
    const product = productId ? getProduct(productId) : undefined;

    if (!product) {
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    const customerId = await getOrCreateStripeCustomer(user);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.amount,
      currency: product.currency,
      customer: customerId,
      // Lets Stripe decide which payment methods to show (card, Link, wallets…)
      // based on your Dashboard settings and the buyer's browser/location.
      automatic_payment_methods: { enabled: true },
      description: product.name,
      // The only place this purchase's identity lives — there's no Checkout
      // Session here to carry a client_reference_id, so the webhook reads
      // these off the payment_intent.succeeded event.
      metadata: {
        productId: product.id,
        supabase_user_id: user.id,
        source: "elements",
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    console.error("[payment-intent]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
