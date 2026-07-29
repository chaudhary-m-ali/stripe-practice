import Link from "next/link";
import { redirect } from "next/navigation";
import { AddPaymentMethodButton } from "@/app/components/add-payment-method-button";
import { Shell } from "@/app/components/shell";
import { isPremiumStatus, TRIAL_DAYS } from "@/lib/plans";
import { getProfile } from "@/lib/profile";
import { getCurrentUser } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/subscription";
import { formatTrialEnd, trialState } from "@/lib/trial";

/**
 * The gated page.
 *
 * proxy.ts already bounced anyone who isn't signed in. This page does the
 * second half — is that signed-in user actually paying? — by reading the row
 * the webhook maintains.
 *
 * The check happens on the SERVER, before any premium content is rendered, so
 * there is nothing in the HTML for a non-subscriber to dig out of devtools.
 */
export default async function PremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ trial?: string }>;
}) {
  const { trial: trialParam } = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/premium");

  const [profile, subscription] = await Promise.all([
    getProfile(),
    getSubscription(),
  ]);
  const trial = trialState(profile, subscription, true);

  if (!isPremiumStatus(subscription?.status)) {
    // A finished trial is the common case now, and "you're on the free plan"
    // is a confusing thing to read on day 15. Say what actually happened.
    return (
      <Shell
        title={trial.expired ? "Your free trial has ended" : "Premium only"}
        subtitle={
          trial.expired
            ? `The ${TRIAL_DAYS} days are up, so this page is locked again.`
            : "Your account is on the free plan, so this page is locked."
        }
      >
        <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {trial.expired
              ? "No card was added before the trial ended, so Stripe cancelled the subscription — nothing was charged. Subscribing turns access back on straight away."
              : subscription
                ? `We have a subscription on file, but its status is "${subscription.status}" — that doesn't unlock premium.`
                : "No subscription found for this account yet."}
          </p>
          <Link
            href="/#pricing"
            className="mt-5 inline-block rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            {trial.expired ? "Subscribe to continue" : "See the plans"}
          </Link>
        </div>

        <p className="mt-6 text-sm text-zinc-500">
          Just paid and still seeing this? The webhook hasn&apos;t reached the
          database yet. Make sure{" "}
          <code className="font-mono">stripe listen</code> is running, then
          refresh.
        </p>
      </Shell>
    );
  }

  const renews = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-US", {
        dateStyle: "medium",
      })
    : null;

  return (
    <Shell
      title={trial.active ? "Welcome to your free trial" : "Welcome to Premium"}
      subtitle="You're seeing this because subscriptions.status says so."
    >
      {trialParam === "started" && trial.active ? (
        <p className="mb-6 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          Trial started — no card was collected and nothing has been charged.
        </p>
      ) : null}

      {trial.active ? (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {trial.daysLeft} {trial.daysLeft === 1 ? "day" : "days"} left ·
            ends {formatTrialEnd(trial.endsAt)}
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            {trial.needsPaymentMethod
              ? "There's no card on file. On the last day Stripe cancels the subscription and this page locks — add one now and it becomes a paid plan instead. You aren't charged until then."
              : "A card is on file. This becomes a paid subscription when the trial ends; cancel before then from your account and you won't be charged."}
          </p>
          {trial.needsPaymentMethod ? (
            <div className="mt-4 max-w-xs">
              <AddPaymentMethodButton />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-900 dark:bg-indigo-950">
        <p className="text-lg font-medium text-indigo-900 dark:text-indigo-100">
          🎉 The secret content
        </p>
        <p className="mt-2 text-indigo-800 dark:text-indigo-200">
          This is the part free users never receive — it isn&apos;t hidden with
          CSS, it simply isn&apos;t rendered for them.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <dl className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {[
            ["Plan", subscription?.plan ?? "—"],
            ["Status", subscription?.status ?? "—"],
            [
              subscription?.cancel_at_period_end
                ? "Access until"
                : trial.active
                  ? "Trial ends"
                  : "Renews",
              renews ?? "—",
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-4 px-5 py-3">
              <dt className="w-40 shrink-0 text-zinc-500">{label}</dt>
              <dd className="font-mono text-xs leading-5">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {subscription?.cancel_at_period_end ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          This subscription is set to cancel at the end of the period. You keep
          access until then.
        </p>
      ) : null}

      <Link href="/account" className="mt-6 inline-block text-sm underline">
        Manage subscription
      </Link>
    </Shell>
  );
}
