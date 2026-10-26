import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/app/components/shell";
import { getOrders } from "@/lib/orders";
import { formatAmount } from "@/lib/products";
import { getCurrentUser } from "@/lib/supabase/server";

const STATUS_STYLE: Record<string, string> = {
  paid: "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  processing:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  failed:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  refunded:
    "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
};

/**
 * The one-off counterpart to /premium: proof that the purchase outlived the
 * redirect. Nothing here is read from Stripe — every row was put in Supabase
 * by the webhook.
 */
export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/orders");

  const orders = await getOrders();

  return (
    <Shell
      title="Your orders"
      subtitle="One row per one-off purchase, written by the webhook — not by the page you were redirected to."
    >
      {orders.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No orders yet. Buy something from either demo and it shows up here
            once the webhook lands.
          </p>
          <div className="mt-5 flex gap-3">
            <Link
              href="/checkout"
              className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Hosted Checkout
            </Link>
            <Link
              href="/elements"
              className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Payment Element
            </Link>
          </div>
          <p className="mt-5 text-sm text-zinc-500">
            Already paid and still empty? The webhook hasn&apos;t reached the
            database — check that{" "}
            <code className="font-mono">stripe listen</code> is running.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li
              key={order.stripe_payment_intent_id}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-medium">
                  {order.product_name ?? order.product_id}
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLE[order.status] ?? STATUS_STYLE.refunded
                  }`}
                >
                  {order.status}
                </span>
                <p className="ml-auto font-medium">
                  {formatAmount(order.amount, order.currency)}
                </p>
              </div>

              <p className="mt-2 text-sm text-zinc-500">
                {new Date(order.created_at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {order.source ? ` · via ${order.source}` : null}
              </p>

              <p className="mt-1 break-all font-mono text-xs text-zinc-400">
                {order.stripe_payment_intent_id}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-sm text-zinc-500">
        Refund one of these from the{" "}
        <a
          href="https://dashboard.stripe.com/test/payments"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Stripe Dashboard ↗
        </a>{" "}
        and refresh — the status changes without any code of ours running in
        between. That&apos;s the same argument as the subscription webhook, on a
        much shorter timescale.
      </p>
    </Shell>
  );
}
