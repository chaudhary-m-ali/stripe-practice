import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Supabase sends people after they click the confirmation link in their
 * signup email. The `code` is swapped for a real session, which gets written
 * into cookies by our server client.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const target = next?.startsWith("/") ? next : "/premium";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${target}`);
}
