import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type OrderRow = {
  stripe_payment_intent_id: string;
  stripe_checkout_session_id: string | null;
  product_id: string;
  product_name: string | null;
  amount: number;
  currency: string;
  status: string;
  source: string | null;
  created_at: string;
};

/**
 * The signed-in user's one-off purchases, newest first.
 *
 * Read with the anon client, so Row Level Security does the authorisation —
 * the query says "all orders" and the database returns only this user's.
 */
export async function getOrders(): Promise<OrderRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "stripe_payment_intent_id, stripe_checkout_session_id, product_id, product_name, amount, currency, status, source, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    // Most likely the orders table hasn't been added yet — schema.sql is safe
    // to re-run. Treat as "no orders" rather than crashing the page.
    console.error("[orders] query failed:", error.message);
    return [];
  }

  return (data as OrderRow[] | null) ?? [];
}
