import Link from "next/link";
import { Shell } from "@/app/components/shell";
import { formatAmount } from "@/lib/products";
import { stripe } from "@/lib/stripe";

const EXPLANATIONS: Record<string, string> = {
  succeeded: "The money is captured. Fulfil the order.",
  processing:
    "Stripe is still settling this one (common for bank debits). You'll get a webhook when it lands.",
  requires_payment_method:
    "The payment method failed or was declined — ask the buyer to try another one.",
  requires_action: "The buyer still has an authentication step to finish.",
  canceled: "The PaymentIntent was canceled.",
};

export default async function PaymentStatusPage({
  searchParams,
}: {
  searchParams: Promise<{
    payment_intent?: string;
    redirect_status?: string;
  }>;
}) {
  // Stripe appends these when confirmPayment redirects to return_url.
  const { payment_intent: paymentIntentId } = await searchParams;

  if (!paymentIntentId) {
    return (
      <Shell
        title="Nothing to show"
        subtitle="Stripe sends you here with ?payment_intent=… after a redirect-based payment."
      >
        <Link href="/elements" className="underline">
          Back to the Payment Element demo
        </Link>
      </Shell>
    );
  }

  // redirect_status in the URL is a hint, not proof. Ask Stripe directly.
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

  return (
    <Shell
      title={
        intent.status === "succeeded" ? "Payment successful" : "Payment status"
      }
      subtitle={EXPLANATIONS[intent.status] ?? `Status: ${intent.status}`}
    >
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
        <dl className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          {[
            ["Status", intent.status],
            ["Amount", formatAmount(intent.amount, intent.currency)],
            ["Product", intent.metadata?.productId ?? "—"],
            ["PaymentIntent id", intent.id],
            ["Last error", intent.last_payment_error?.message ?? "—"],
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

      <div className="mt-8 flex gap-4">
        <Link href="/elements" className="text-sm underline">
          Try again
        </Link>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>
    </Shell>
  );
}
