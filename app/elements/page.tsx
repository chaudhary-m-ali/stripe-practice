import { SetupCheck } from "@/app/components/setup-check";
import { Shell } from "@/app/components/shell";
import { formatAmount, PRODUCTS } from "@/lib/products";
import { PaymentForm } from "./payment-form";

export default function ElementsPage() {
  // The card the demo charges. Amount shown here is only for display — the
  // PaymentIntent's real amount is set server-side from this same catalog.
  const product = PRODUCTS[0];

  return (
    <Shell
      title="Payment Element"
      subtitle="The card form is embedded in this page. Stripe still owns the iframe, so the card number never reaches your server."
    >
      <SetupCheck />

      <div className="mb-6 flex items-center gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <span className="text-3xl">{product.emoji}</span>
        <div className="flex-1">
          <p className="font-medium">{product.name}</p>
          <p className="text-sm text-zinc-500">{product.description}</p>
        </div>
        <p className="font-medium">
          {formatAmount(product.amount, product.currency)}
        </p>
      </div>

      <PaymentForm productId={product.id} />

      <p className="mt-8 text-sm text-zinc-500">
        Try <code className="font-mono">4000 0025 0000 3155</code> to see the 3D
        Secure step, or <code className="font-mono">4000 0000 0000 9995</code>{" "}
        to see a decline handled inline.
      </p>
    </Shell>
  );
}
