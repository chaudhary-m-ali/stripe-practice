import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * True once NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
 * Everything auth-related checks this first so the app still renders (showing
 * the setup banner) before you've created your Supabase project.
 */
export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http") &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length &&
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.startsWith("paste_")
  );
}

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Uses the ANON key — every query is still filtered by Row Level Security, so
 * a user can only ever read their own rows.
 *
 * Must be created per request: it carries that request's auth cookies.
 */
export async function createClient() {
  // cookies() is async in Next.js 16.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components can't set cookies. That's fine — proxy.ts
            // refreshes the session on every request, so tokens stay fresh.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null. Never throws — returns null when Supabase
 * isn't configured yet, so pages can render their setup instructions.
 *
 * getUser() revalidates the JWT against Supabase's auth server. Don't swap it
 * for getSession(), which trusts whatever is in the cookie.
 */
export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error(
      "[supabase] getUser failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
