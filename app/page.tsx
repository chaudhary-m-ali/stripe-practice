import Link from "next/link";
import { SetupCheck } from "@/app/components/setup-check";

const FLOWS = [
  {
    href: "/checkout",
    badge: "Flow 1",
    title: "Stripe Checkout (hosted)",
    description:
      "You create a Checkout Session on the server and redirect. Stripe hosts the payment page, so card data never touches your app. Fewest moving parts.",
    steps: [
      "Browser → POST /api/checkout-session",
      "Server → stripe.checkout.sessions.create()",
      "Browser → redirect to session.url on stripe.com",
      "Stripe → redirect back to /success?session_id=…",
    ],
  },
  {
    href: "/elements",
    badge: "Flow 2",
    title: "Payment Element (embedded)",
    description:
      "The form lives in your own page, inside a Stripe-hosted iframe. You create a PaymentIntent, pass its client_secret to the browser, and confirm there.",
    steps: [
      "Browser → POST /api/payment-intent",
      "Server → stripe.paymentIntents.create() → client_secret",
      "Browser → <PaymentElement /> + stripe.confirmPayment()",
      "Stripe → redirect back to /payment-status",
    ],
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center px-6 py-16">
      <main className="w-full max-w-2xl">
        <SetupCheck />
        <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          Test mode
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          Stripe payments, two ways
        </h1>
        <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
          The same $5 sticker pack, paid for through the two flows you will
          actually use in production. Both run against your test keys, so
          nothing is ever charged.
        </p>

        <div className="mt-10 flex flex-col gap-4">
          {FLOWS.map((flow) => (
            <Link
              key={flow.href}
              href={flow.href}
              className="group rounded-xl border border-zinc-200 p-6 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <div className="flex items-center gap-3">
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                  {flow.badge}
                </span>
                <h2 className="text-xl font-medium">{flow.title}</h2>
                <span className="ml-auto text-zinc-400 transition-transform group-hover:translate-x-1">
                  →
                </span>
              </div>
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                {flow.description}
              </p>
              <ol className="mt-4 space-y-1 border-l border-zinc-200 pl-4 font-mono text-xs text-zinc-500 dark:border-zinc-800">
                {flow.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Test cards
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            {[
              ["4242 4242 4242 4242", "Succeeds immediately"],
              ["4000 0025 0000 3155", "Requires 3D Secure authentication"],
              ["4000 0000 0000 9995", "Declined — insufficient funds"],
              ["4000 0000 0000 0002", "Declined — generic card decline"],
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
        </div>

        <p className="mt-8 text-sm text-zinc-500">
          Not working? Check that <code className="font-mono">.env.local</code>{" "}
          has your test keys from the{" "}
          <a
            className="underline"
            href="https://dashboard.stripe.com/test/apikeys"
            target="_blank"
            rel="noopener noreferrer"
          >
            Stripe Dashboard
          </a>
          , then restart the dev server.
        </p>
      </main>
    </div>
  );
}
