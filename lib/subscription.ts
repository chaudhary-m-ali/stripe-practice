import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { isPremiumStatus, type BillingInterval } from "@/lib/plans";

export type SubscriptionRow = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: string;
  price_id: string | null;
  plan: BillingInterval | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

/**
 * Reads the signed-in user's subscription from Supabase — NOT from Stripe.
 *
 * The webhook keeps this row in sync, so gating a page is a single indexed
 * database read instead of a network round trip to Stripe on every request.
 * RLS makes sure a user can only ever see their own row.
 */
export async function getSubscription(): Promise<SubscriptionRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "stripe_subscription_id, stripe_customer_id, status, price_id, plan, current_period_end, cancel_at_period_end",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Most likely the schema hasn't been applied yet. Treat as "no plan"
    // rather than crashing the page.
    console.error("[subscription] query failed:", error.message);
    return null;
  }

  return (data as SubscriptionRow | null) ?? null;
}

/** True when the current user should see premium content. */
export async function hasPremium(): Promise<boolean> {
  const subscription = await getSubscription();
  return isPremiumStatus(subscription?.status);
}
