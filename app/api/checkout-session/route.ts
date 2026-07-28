import { NextResponse } from "next/server";
import { baseUrl, stripe } from "@/lib/stripe";
import { getProduct } from "@/lib/products";

/**
 * FLOW 1 — Stripe Checkout (hosted).
 *
 * The browser posts a product id. We look up the real price on the server,
 * create a Checkout Session, and hand back its URL. Stripe hosts the whole
 * payment page, so no card data ever touches this app.
 */
export async function POST(request: Request) {
  try {
    const { productId } = (await request.json()) as { productId?: string };
    const product = productId ? getProduct(productId) : undefined;

    if (!product) {
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
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
      // webhook event, which is where you should actually fulfil the order.
      metadata: { productId: product.id },
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
