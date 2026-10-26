import type Stripe from "stripe";
import { getProduct } from "@/lib/products";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Write a one-off purchase into Supabase.
 *
 * This is the `mode: "payment"` counterpart to sync-subscription.ts, and the
 * difference between them is the whole point:
 *
 *   A subscription sync is naturally idempotent — it copies the current state
 *   of a Stripe object, so running it twice writes the same truth twice.
 *
 *   Fulfilling an order is NOT. "Insert a row and ship the goods" run twice
 *   ships twice. And it WILL run twice: Stripe retries any delivery it didn't
 *   get a 2xx for, and a hosted Checkout fires two separate events for one
 *   purchase (checkout.session.completed AND payment_intent.succeeded).
 *
 * So every write here is an upsert keyed on the PaymentIntent id, which is the
 * one identifier both of those events agree on. Deliver the same event five
 * times and you still have one order.
 */

/** paid | processing | failed | refunded — see supabase/schema.sql. */
export type OrderStatus = "paid" | "processing" | "failed" | "refunded";

/**
 * Columns to write. Anything left `undefined` is omitted from the request
 * body, and PostgREST only updates the columns it is actually sent — so the
 * PaymentIntent event can't blank out the email that the Checkout Session
 * event knew and it didn't.
 */
type OrderFields = {
  stripe_payment_intent_id: string;
  user_id: string;
  status: OrderStatus;
  product_id: string;
  amount: number;
  currency: string;
  product_name?: string;
  email?: string;
  stripe_checkout_session_id?: string;
  source?: "checkout" | "elements";
};

async function upsertOrder(fields: OrderFields) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("orders")
    .upsert(fields, { onConflict: "stripe_payment_intent_id" });

  if (error) {
    throw new Error(`Supabase orders upsert failed: ${error.message}`);
  }

  console.log(
    `🧾 ${fields.stripe_payment_intent_id} → user ${fields.user_id} | ${fields.product_id} | ${fields.status}`,
  );
}

/**
 * FLOW 1 — hosted Checkout finished.
 *
 * The session carries the buyer's email and the Supabase user id we set as
 * client_reference_id, neither of which is on the PaymentIntent.
 */
export async function recordOrderFromSession(session: Stripe.Checkout.Session) {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) {
    console.warn(`[order] session ${session.id} has no PaymentIntent — skipping`);
    return;
  }

  // client_reference_id is the belt, payment_intent_data.metadata is the
  // braces — see app/api/checkout-session/route.ts, which sets both.
  const userId =
    session.client_reference_id ?? session.metadata?.supabase_user_id;
  const productId = session.metadata?.productId;

  if (!userId || !productId) {
    // Don't throw. A payment made by hand in the Dashboard has no Supabase
    // user, and retrying forever wouldn't conjure one up.
    console.warn(
      `[order] session ${session.id} has no user/product metadata — skipping`,
    );
    return;
  }

  await upsertOrder({
    stripe_payment_intent_id: paymentIntentId,
    stripe_checkout_session_id: session.id,
    user_id: userId,
    product_id: productId,
    product_name: getProduct(productId)?.name,
    // amount_total is what Stripe actually charged, including any discount —
    // it is not necessarily the catalog price.
    amount: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    email: session.customer_details?.email ?? undefined,
    status: session.payment_status === "paid" ? "paid" : "processing",
    source: "checkout",
  });
}

/**
 * FLOW 2 — an embedded Payment Element payment settled (or failed).
 *
 * This event also fires for hosted Checkout payments. That's fine: it lands on
 * the same row as recordOrderFromSession, with the same id, in either order.
 */
export async function recordOrderFromPaymentIntent(
  intent: Stripe.PaymentIntent,
  status: OrderStatus,
) {
  const userId = intent.metadata?.supabase_user_id;
  const productId = intent.metadata?.productId;

  if (!userId || !productId) {
    console.warn(
      `[order] payment intent ${intent.id} has no user/product metadata — skipping`,
    );
    return;
  }

  await upsertOrder({
    stripe_payment_intent_id: intent.id,
    user_id: userId,
    product_id: productId,
    product_name: getProduct(productId)?.name,
    amount: intent.amount,
    currency: intent.currency,
    status,
    // Only claims the source when this intent wasn't made by Checkout — the
    // hosted flow sets its own, and shouldn't be relabelled by this event.
    source: intent.metadata?.source === "elements" ? "elements" : undefined,
  });
}

/**
 * Refunded from the Stripe Dashboard, days later, with no browser anywhere.
 *
 * An UPDATE rather than an upsert: if the order isn't there, an empty result
 * is the right outcome — inventing a row from a refund would be worse.
 */
export async function markOrderRefunded(paymentIntentId: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("orders")
    .update({ status: "refunded" satisfies OrderStatus })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .select("id");

  if (error) {
    throw new Error(`Supabase orders refund update failed: ${error.message}`);
  }

  if (!data?.length) {
    console.warn(`[order] refund for unknown payment intent ${paymentIntentId}`);
    return;
  }

  console.log(`↩️  ${paymentIntentId} refunded`);
}
