import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy`. It runs before
 * every matched request.
 *
 * Two jobs:
 *  1. Refresh the Supabase session and write the rotated cookies onto the
 *     response. Server Components can't set cookies, so without this the
 *     access token would expire and users would get logged out at random.
 *  2. Bounce signed-out visitors away from /premium and /account.
 *
 * Note this only checks that you're LOGGED IN. Whether you're a paying
 * subscriber is checked in the page itself, against the database.
 */
function configured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http") &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.startsWith("paste_")
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before you've created the Supabase project, let every request through so
  // the pages can render their own setup instructions.
  if (!configured()) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the JWT against Supabase's auth server. Don't use
  // getSession() for authorisation — it trusts whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/premium") || path.startsWith("/account");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return this exact response object so the refreshed auth
  // cookies survive. Building a new NextResponse here would drop them.
  return response;
}

export const config = {
  // Skip static assets — otherwise every image and CSS file pays for an
  // auth round trip.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
