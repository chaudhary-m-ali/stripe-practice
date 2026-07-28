import Link from "next/link";
import { SetupCheck } from "@/app/components/setup-check";
import { SubscribeButton } from "@/app/components/subscribe-button";
import {
  formatPrice,
  FREE_FEATURES,
  isPremiumStatus,
  PREMIUM_FEATURES,
  PREMIUM_PLANS,
} from "@/lib/plans";
import { getCurrentUser } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/subscription";

export default async function Home() {
  const user = await getCurrentUser();
  const subscription = user ? await getSubscription() : null;
  const premium = isPremiumStatus(subscription?.status);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-16">
      <main className="w-full max-w-3xl">
        <SetupCheck />

        <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          Test mode
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          A subscription app, end to end
        </h1>
        <p className="mt-3 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Supabase handles accounts. Stripe handles billing. A webhook keeps the
          two in sync, and the premium page is gated on what the database says.
          Nothing is ever charged — these are test keys.
        </p>

        {premium ? (
          <div className="mt-8 rounded-xl border border-green-300 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950">
            <p className="font-medium text-green-900 dark:text-green-200">
              You&apos;re on Premium ({subscription?.plan ?? "unknown"} billing)
            </p>
            <div className="mt-3 flex gap-4 text-sm">
              <Link
                href="/premium"
                className="underline text-green-900 dark:text-green-200"
              >
                Go to the premium page
              </Link>
              <Link
                href="/account"
                className="underline text-green-900 dark:text-green-200"
              >
                Manage subscription
              </Link>
            </div>
          </div>
        ) : null}

        {/* ------------------------------- pricing ------------------------- */}
        <h2 id="pricing" className="mt-14 scroll-mt-6 text-2xl font-semibold">
          Plans
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {/* Free */}
          <div className="flex flex-col rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <p className="text-sm font-medium text-zinc-500">Free</p>
            <p className="mt-2 text-3xl font-semibold">$0</p>
            <p className="text-sm text-zinc-500">forever</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              {FREE_FEATURES.map((feature) => (
                <li key={feature}>· {feature}</li>
              ))}
            </ul>
            <div className="mt-6">
              {user ? (
                <p className="rounded-full border border-zinc-200 px-5 py-2.5 text-center text-sm text-zinc-500 dark:border-zinc-800">
                  Your current plan
                </p>
              ) : (
                <Link
                  href="/login"
                  className="block rounded-full border border-zinc-300 px-5 py-2.5 text-center text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Create account
                </Link>
              )}
            </div>
          </div>

          {/* Premium — monthly and yearly */}
          {(["monthly", "yearly"] as const).map((interval) => {
            const plan = PREMIUM_PLANS[interval];
            const isCurrent = premium && subscription?.plan === interval;

            return (
              <div
                key={interval}
                className={`flex flex-col rounded-xl border p-5 ${
                  interval === "yearly"
                    ? "border-indigo-300 dark:border-indigo-800"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-500">
                    Premium {interval}
                  </p>
                  {plan.note ? (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      Best value
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-3xl font-semibold">
                  {formatPrice(plan.amount, plan.currency)}
                </p>
                <p className="text-sm text-zinc-500">{plan.label}</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {PREMIUM_FEATURES.map((feature) => (
                    <li key={feature}>· {feature}</li>
                  ))}
                  {plan.note ? (
                    <li className="text-indigo-600 dark:text-indigo-400">
                      · {plan.note}
                    </li>
                  ) : null}
                </ul>
                <div className="mt-6">
                  {isCurrent ? (
                    <Link
                      href="/account"
                      className="block rounded-full bg-green-600 px-5 py-2.5 text-center text-sm font-medium text-white"
                    >
                      Current plan
                    </Link>
                  ) : premium ? (
                    <Link
                      href="/account"
                      className="block rounded-full border border-zinc-300 px-5 py-2.5 text-center text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Switch to {interval}
                    </Link>
                  ) : (
                    <SubscribeButton
                      interval={interval}
                      signedIn={!!user}
                      className="bg-indigo-600 text-white hover:bg-indigo-500"
                    >
                      {user ? `Subscribe ${interval}` : "Sign in to subscribe"}
                    </SubscribeButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ------------------------------- how it works -------------------- */}
        <h2 className="mt-14 text-2xl font-semibold">How the gate works</h2>
        <ol className="mt-4 space-y-1 border-l border-zinc-200 pl-4 font-mono text-xs text-zinc-500 dark:border-zinc-800">
          <li>signup → Supabase auth.users → trigger creates profiles row</li>
          <li>subscribe → POST /api/stripe/subscribe (interval only)</li>
          <li>server → getOrCreateStripeCustomer() → checkout.sessions.create</li>
          <li>Stripe → checkout.session.completed → /api/webhook</li>
          <li>webhook → service-role upsert into subscriptions</li>
          <li>/premium → reads subscriptions.status → allow or redirect</li>
        </ol>
        <p className="mt-4 max-w-xl text-sm text-zinc-500">
          Renewals, failed cards and cancellations arrive months later with no
          browser open — the webhook is the only thing that sees them, which is
          why access is read from the database and not from the redirect.
        </p>

        {/* ------------------------------- one-off demos ------------------- */}
        <h2 className="mt-14 text-2xl font-semibold">
          One-off payment demos
        </h2>
        <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
          Separate from the subscription flow above — no account needed. These
          use <code className="font-mono text-sm">mode: &quot;payment&quot;</code>{" "}
          instead of <code className="font-mono text-sm">&quot;subscription&quot;</code>.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/checkout"
            className="flex-1 rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <p className="font-medium">Hosted Checkout →</p>
            <p className="mt-1 text-sm text-zinc-500">
              Redirect to a Stripe-hosted page.
            </p>
          </Link>
          <Link
            href="/elements"
            className="flex-1 rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <p className="font-medium">Payment Element →</p>
            <p className="mt-1 text-sm text-zinc-500">
              Embedded card form on your own page.
            </p>
          </Link>
        </div>

        {/* ------------------------------- test cards ---------------------- */}
        <h2 className="mt-14 text-2xl font-semibold">Test cards</h2>
        <dl className="mt-4 space-y-2 text-sm">
          {[
            ["4242 4242 4242 4242", "Succeeds immediately"],
            ["4000 0025 0000 3155", "Requires 3D Secure authentication"],
            ["4000 0000 0000 9995", "Declined — insufficient funds"],
            ["4000 0000 0000 0341", "Attaches, then fails on renewal"],
          ].map(([number, meaning]) => (
            <div key={number} className="flex flex-wrap gap-x-4">
              <dt className="font-mono text-zinc-900 dark:text-zinc-100">
                {number}
              </dt>
              <dd className="text-zinc-500">{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-zinc-500">
          Any future expiry, any 3-digit CVC, any postal code.
        </p>
      </main>
    </div>
  );
}
