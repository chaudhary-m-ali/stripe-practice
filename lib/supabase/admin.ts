import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. BYPASSES Row Level Security.
 *
 * Only the Stripe webhook uses this — it has no logged-in user, so it can't
 * rely on RLS, and it needs to write rows that users are not allowed to write
 * themselves. Never import this from a Client Component, and never expose
 * SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the webhook",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
