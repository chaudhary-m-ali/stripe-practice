import { SetupCheck } from "@/app/components/setup-check";
import { Shell } from "@/app/components/shell";
import { PRODUCTS } from "@/lib/products";
import { BuyButton } from "./buy-button";

export default async function CheckoutPage({
  searchParams,
}: {
  // In Next.js 16 searchParams is a Promise and must be awaited.
  searchParams: Promise<{ canceled?: string }>;
}) {
  const { canceled } = await searchParams;

  return (
    <Shell
      title="Stripe Checkout"
      subtitle="Pick an item. You'll be redirected to a payment page hosted by Stripe, then sent back here."
    >
      <SetupCheck />

      {canceled ? (
        <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Payment canceled — you came back without paying. Nothing was charged.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {PRODUCTS.map((product) => (
          <li
            key={product.id}
            className="flex items-center gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <span className="text-3xl">{product.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{product.name}</p>
              <p className="truncate text-sm text-zinc-500">
                {product.description}
              </p>
            </div>
            <BuyButton product={product} />
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-zinc-500">
        The price is read from the server-side catalog in{" "}
        <code className="font-mono">lib/products.ts</code> — the browser only
        sends a product id, so a tampered request can&apos;t change the amount.
      </p>
    </Shell>
  );
}
