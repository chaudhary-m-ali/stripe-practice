import Link from "next/link";
import { redirect } from "next/navigation";
import { ManageBillingButton } from "@/app/components/manage-billing-button";
import { Shell } from "@/app/components/shell";
import { isPremiumStatus, PREMIUM_PLANS } from "@/lib/plans";
import { getProfile } from "@/lib/profile";
import { getCurrentUser } from "@/lib/supabase/server";
import { getSubscription } from "@/lib/subscription";

const STATUS_HELP: Record<string, string> = {
  active: "Paid and current.",
  trialing: "In a free trial — premium is unlocked.",
  past_due: "A payment failed. Stripe is retrying; update the card to be safe.",
  canceled: "Ended. Subscribe again to restore access.",
  incomplete: "The first payment never finished.",
  incomplete_expired: "The first payment was never completed in time.",
  unpaid: "Retries exhausted. Access is off.",
  paused: "Paused — no charges, no access.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const [profile, subscription] = await Promise.all([
    getProfile(),
    getSubscription(),
  ]);
  const premium = isPremiumStatus(subscription?.status);

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-US", {
        dateStyle: "medium",
      })
    : null;

  return (
    <Shell title="Account" subtitle={profile?.full_name ?? user.email ?? undefined}>
      {checkout === "success" ? (
        <p className="mb-6 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          Checkout finished. If the plan below still says free, the webhook
          hasn&apos;t landed yet — give it a second and refresh.
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
        <dl className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {[
            ["Name", profile?.full_name ?? "—"],
            ["Email", profile?.email ?? user.email ?? "—"],
            ["Plan", premium ? `Premium (${subscription?.plan ?? "?"})` : "Free"],
            ["Status", subscription?.status ?? "no subscription"],
            [
              subscription?.cancel_at_period_end
                ? "Access until"
                : "Next renewal",
              periodEnd ?? "—",
            ],
            [
              "Price",
              subscription?.plan
                ? PREMIUM_PLANS[subscription.plan].priceId
                : "—",
            ],
            ["Subscription id", subscription?.stripe_subscription_id ?? "—"],
            ["Customer id", subscription?.stripe_customer_id ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-4 px-5 py-3">
              <dt className="w-40 shrink-0 text-zinc-500">{label}</dt>
              <dd className="min-w-0 break-all font-mono text-xs leading-5">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {subscription?.status && STATUS_HELP[subscription.status] ? (
        <p className="mt-3 text-sm text-zinc-500">
          {STATUS_HELP[subscription.status]}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {premium ? (
          <>
            <ManageBillingButton />
            <Link
              href="/premium"
              className="text-sm underline text-zinc-600 dark:text-zinc-400"
            >
              Go to premium page
            </Link>
          </>
        ) : (
          <Link
            href="/#pricing"
            className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Upgrade to Premium
          </Link>
        )}
      </div>

      <p className="mt-8 text-sm text-zinc-500">
        Everything above is read from Supabase, not from Stripe. The webhook is
        what puts it there — cancel from the billing portal and watch this page
        change without any code of ours running in between.
      </p>
    </Shell>
  );
}
