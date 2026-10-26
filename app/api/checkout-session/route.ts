import { NextResponse } from "next/server";
import { baseUrl, stripe } from "@/lib/stripe";
import { getProduct } from "@/lib/products";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";
import { createClient } from "@/lib/supabase/server";

/**
 * FLOW 1 — Stripe Checkout (hosted).
 *
 * The browser posts a product id. We look up the real price on the server,
 * create a Checkout Session, and hand back its URL. Stripe hosts the whole
 * payment page, so no card data ever touches this app.
 */
export async function POST(request: Request) {
  try {
    // Orders belong to an account, so there has to be one. proxy.ts already
    // bounces signed-out visitors off /checkout; this is the real boundary —
    // a page redirect is UI, an API check is security.
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

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Reuses the same Stripe customer as the subscription flow, so one
      // person's payments and invoices stay in one place in the Dashboard.
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          // price_data builds a one-off price inline. In production you'd
          // normally reference a saved Price id: { price: "price_123" }.
          price_data: {
            currency: product.currency,
            unit_amount: product.amount,
            product_data: {
              name: product.name,
              description: product.description,
            },
          },
        },
      ],
      // {CHECKOUT_SESSION_ID} is a literal placeholder Stripe substitutes.
      success_url: `${baseUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl()}/checkout?canceled=1`,
      // Anything you need to reconcile the order later. It comes back on the
      // webhook event, which is where the order is actually fulfilled.
      metadata: { productId: product.id, supabase_user_id: user.id },
      client_reference_id: user.id,
      // Session metadata is NOT copied onto the PaymentIntent. Without this,
      // the payment_intent.succeeded event for this purchase would arrive with
      // no idea who bought what — so set it explicitly and both events can
      // stand on their own.
      payment_intent_data: {
        metadata: { productId: product.id, supabase_user_id: user.id },
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
    console.error("[checkout-session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
