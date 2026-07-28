/**
 * The two recurring prices under the "stripe tutorial" product in your Stripe
 * account. Price ids are safe to expose — they identify a price, they don't
 * authorise anything. The amount is still charged from Stripe's own record,
 * never from what the browser sends.
 */
export type BillingInterval = "monthly" | "yearly";

export type PremiumPlan = {
  interval: BillingInterval;
  priceId: string;
  amount: number;
  currency: string;
  label: string;
  /** Shown next to the yearly option. */
  note?: string;
};

export const PREMIUM_PLANS: Record<BillingInterval, PremiumPlan> = {
  monthly: {
    interval: "monthly",
    priceId: "price_1Ty5u6LDG4sRXhAhPwG6b1aT",
    amount: 1000,
    currency: "usd",
    label: "per month",
  },
  yearly: {
    interval: "yearly",
    priceId: "price_1Ty7aLLDG4sRXhAhmpA8ueMC",
    amount: 9900,
    currency: "usd",
    label: "per year",
    note: "2 months free vs monthly",
  },
};

export const FREE_FEATURES = [
  "Browse the home page",
  "Create an account",
  "See what you're missing",
];

export const PREMIUM_FEATURES = [
  "Access to the premium page",
  "Cancel or switch plans any time",
  "Monthly or yearly billing",
];

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

/** Map a Stripe price id back to our interval, for storing in the database. */
export function intervalForPriceId(
  priceId: string | null | undefined,
): BillingInterval | null {
  if (!priceId) return null;
  const match = Object.values(PREMIUM_PLANS).find((p) => p.priceId === priceId);
  return match?.interval ?? null;
}

export function formatPrice(amount: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
}

/**
 * Stripe statuses that should unlock premium content. `past_due` is
 * deliberately included — the card failed but Stripe is still retrying, and
 * cutting access off instantly is a good way to lose a customer who just needs
 * to update their card. Flip this if you'd rather be strict.
 */
export const ACTIVE_STATUSES = ["active", "trialing", "past_due"] as const;

export function isPremiumStatus(status: string | null | undefined): boolean {
  return !!status && (ACTIVE_STATUSES as readonly string[]).includes(status);
}
