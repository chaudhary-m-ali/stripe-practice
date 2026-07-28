import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { getCurrentUser } from "@/lib/supabase/server";
import { isPremiumStatus } from "@/lib/plans";
import { displayName } from "@/lib/profile";
import { getSubscription } from "@/lib/subscription";

export async function Nav() {
  const user = await getCurrentUser();
  const subscription = user ? await getSubscription() : null;
  const premium = isPremiumStatus(subscription?.status);

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex w-full max-w-3xl items-center gap-5 px-6 py-4 text-sm">
        <Link href="/" className="font-semibold">
          Stripe Practice
        </Link>

        <Link
          href="/premium"
          className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Premium
        </Link>

        {user ? (
          <Link
            href="/account"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Account
          </Link>
        ) : null}

        <div className="ml-auto flex items-center gap-4">
          {premium ? (
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Premium
            </span>
          ) : null}

          {user ? (
            <>
              <span
                className="hidden max-w-40 truncate text-zinc-500 sm:inline"
                title={user.email ?? undefined}
              >
                {displayName(user)}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-zinc-900 px-4 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
