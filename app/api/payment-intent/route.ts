import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getProduct } from "@/lib/products";

/**
 * FLOW 2 — Payment Element (embedded).
 *
 * A PaymentIntent is Stripe's object for "collect this much money, once".
 * We create it server-side and return only its `client_secret`, which lets the
 * browser confirm THAT ONE intent and nothing else. The secret key stays here.
 */
export async function POST(request: Request) {
  try {
    const { productId } = (await request.json()) as { productId?: string };
    const product = productId ? getProduct(productId) : undefined;

    if (!product) {
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.amount,
      currency: product.currency,
      // Lets Stripe decide which payment methods to show (card, Link, wallets…)
      // based on your Dashboard settings and the buyer's browser/location.
      automatic_payment_methods: { enabled: true },
      description: product.name,
      metadata: { productId: product.id },
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
