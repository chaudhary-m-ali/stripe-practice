import type { User } from "@supabase/supabase-js";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type ProfileRow = {
  full_name: string | null;
  email: string | null;
  stripe_customer_id: string | null;
};

/**
 * The signed-in user's profile row.
 *
 * Reading this rather than user_metadata proves the handle_new_user trigger
 * actually ran — the name gets to `profiles` only if it did.
 */
export async function getProfile(): Promise<ProfileRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, email, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[profile] query failed:", error.message);
    return null;
  }

  return (data as ProfileRow | null) ?? null;
}

/**
 * Best-effort display name straight off the session — no extra query.
 * Accounts created before the full name field existed fall back to email.
 */
export function displayName(user: User): string {
  const fromMetadata = user.user_metadata?.full_name;
  if (typeof fromMetadata === "string" && fromMetadata.trim()) {
    return fromMetadata.trim();
  }
  return user.email ?? "Account";
}
