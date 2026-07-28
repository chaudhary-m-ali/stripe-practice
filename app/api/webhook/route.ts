import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

/**
 * FLOW 3 — Webhooks.
 *
 * The redirect back to /success can be lost (browser closed, network drop), so
 * it is NOT a reliable fulfilment signal. Stripe also POSTs events here
 * server-to-server and retries on failure. Fulfil orders from this handler.
 *
 * Run locally with:
 *   stripe listen --forward-to localhost:3000/api/webhook
 * and put the printed `whsec_...` into STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set" },
      { status: 500 },
    );
  }

  // The signature is computed over the EXACT raw bytes, so read text(), never
  // json() — parsing and re-serialising would change the payload.
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      secret,
    );
  } catch (error) {
    // A failed signature check means the request did not come from Stripe.
    const message = error instanceof Error ? error.message : "Invalid payload";
    console.error("[webhook] signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      console.log(
        `✅ Checkout completed — session ${session.id}, product ${
          session.metadata?.productId ?? "n/a"
        }, ${session.amount_total} ${session.currency}`,
      );
      // → mark the order paid, send the receipt, grant access, etc.
      break;
    }
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      console.log(
        `✅ PaymentIntent succeeded — ${intent.id}, ${intent.amount} ${intent.currency}`,
      );
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      console.log(
        `❌ PaymentIntent failed — ${intent.id}: ${
          intent.last_payment_error?.message ?? "unknown reason"
        }`,
      );
      break;
    }
    default:
      console.log(`ℹ️  Unhandled event type: ${event.type}`);
  }

  // Always 2xx quickly, or Stripe will retry the delivery.
  return NextResponse.json({ received: true });
}
