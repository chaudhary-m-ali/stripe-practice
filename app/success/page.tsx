import Link from "next/link";
import { Shell } from "@/app/components/shell";
import { formatAmount } from "@/lib/products";
import { stripe } from "@/lib/stripe";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return (
      <Shell title="No session" subtitle="This page needs a ?session_id=…">
        <Link href="/checkout" className="underline">
          Back to checkout
        </Link>
      </Shell>
    );
  }

  // Never trust the query string alone — anyone can type ?session_id=whatever.
  // Re-fetch the session from Stripe and read its real payment_status.
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });

  const paid = session.payment_status === "paid";
  const intent =
    typeof session.payment_intent === "string" ? null : session.payment_intent;

  return (
    <Shell
      title={paid ? "Payment successful" : "Payment not completed"}
      subtitle={
        paid
          ? "Stripe confirmed the charge. In test mode no real money moved."
          : `Stripe reports payment_status = "${session.payment_status}".`
      }
    >
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
        <dl className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {[
            [
              "Amount",
              session.amount_total
                ? formatAmount(session.amount_total, session.currency ?? "usd")
                : "—",
            ],
            ["Payment status", session.payment_status],
            ["Session status", session.status ?? "—"],
            ["Email", session.customer_details?.email ?? "—"],
            ["Product", session.metadata?.productId ?? "—"],
            ["Session id", session.id],
            ["PaymentIntent id", intent?.id ?? "—"],
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

      <p className="mt-6 text-sm text-zinc-500">
        This page is for the buyer&apos;s benefit only. Fulfil the order from
        the <code className="font-mono">checkout.session.completed</code>{" "}
        webhook instead — the redirect can be lost if the browser is closed.
      </p>

      <div className="mt-8 flex gap-4">
        <Link href="/checkout" className="text-sm underline">
          Buy something else
        </Link>
        <a
          href={`https://dashboard.stripe.com/test/payments`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline"
        >
          See it in the Dashboard ↗
        </a>
      </div>
    </Shell>
  );
}
