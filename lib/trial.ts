import { isPremiumStatus, TRIAL_DAYS } from "@/lib/plans";
import { getProfile, type ProfileRow } from "@/lib/profile";
import { getSubscription, type SubscriptionRow } from "@/lib/subscription";
import { getCurrentUser } from "@/lib/supabase/server";

export type TrialState = {
  /** On a free trial right now. Premium is unlocked. */
  active: boolean;
  /** This account has started a trial at some point — one is all it gets. */
  used: boolean;
  /** Had a trial, it's over, and nothing paid took its place. */
  expired: boolean;
  /** Can start one: signed in, never trialed, no subscription. */
  eligible: boolean;
  /** Whole days until the trial ends, never negative. Null when not trialing. */
  daysLeft: number | null;
  /** When the trial ends. Null when not trialing. */
  endsAt: Date | null;
  /** Trialing with nothing to charge — access dies on `endsAt` unless a card
   *  is added. This is what turns the CTA into "Add payment method". */
  needsPaymentMethod: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Everything the UI needs to know about this account's trial, derived from two
 * rows the webhook keeps honest. Nothing here calls Stripe.
 *
 * `used` comes from `profiles.trial_started_at` rather than from the
 * subscription, because a cancelled subscription row can be replaced by a new
 * one later — the profile stamp is what makes "one trial per account" stick.
 */
export function trialState(
  profile: ProfileRow | null,
  subscription: SubscriptionRow | null,
  signedIn: boolean,
): TrialState {
  const used = !!profile?.trial_started_at;
  const active = subscription?.status === "trialing";
  const premium = isPremiumStatus(subscription?.status);

  const endsAt = active && subscription?.trial_end
    ? new Date(subscription.trial_end)
    : null;

  return {
    active,
    used,
    expired: used && !premium,
    eligible: signedIn && !used && !premium,
    daysLeft: endsAt ? Math.max(0, Math.ceil((+endsAt - Date.now()) / DAY)) : null,
    endsAt,
    needsPaymentMethod: active && !subscription?.has_payment_method,
  };
}

/** Same thing, fetching what it needs itself. */
export async function getTrialState(): Promise<TrialState> {
  const user = await getCurrentUser();
  if (!user) return trialState(null, null, false);

  const [profile, subscription] = await Promise.all([
    getProfile(),
    getSubscription(),
  ]);
  return trialState(profile, subscription, true);
}

export function formatTrialEnd(endsAt: Date | null): string | null {
  return endsAt
    ? endsAt.toLocaleDateString("en-US", { dateStyle: "medium" })
    : null;
}

export { TRIAL_DAYS };
