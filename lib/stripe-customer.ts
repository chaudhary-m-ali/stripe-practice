import type { User } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One Stripe customer per Supabase user, reused forever.
 *
 * Without this you'd create a brand new customer every time someone opens
 * checkout, and their billing history would be scattered across duplicates.
 *
 * The `supabase_user_id` on the Stripe customer is the link back — the webhook
 * uses it to work out who a subscription belongs to.
 */
export async function getOrCreateStripeCustomer(user: User): Promise<string> {
  // Service role: `profiles` has no update policy, so users can't rewrite
  // their own customer id and attach themselves to someone else's billing.
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id as string;
  }

  // Prefer the stored profile name, fall back to what's on the session.
  const fullName =
    (profile?.full_name as string | null) ??
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null);

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    // Shows up on invoices and in the Stripe Dashboard instead of a bare id.
    name: fullName ?? undefined,
    metadata: { supabase_user_id: user.id },
  });

  const { error } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email: user.email,
      full_name: fullName,
      stripe_customer_id: customer.id,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Could not save Stripe customer id: ${error.message}`);
  }

  return customer.id;
}
