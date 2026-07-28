/**
 * Server Component — runs on the server, so it can read the secret key's
 * presence (never its value) and tell you what's still missing.
 */
export function SetupCheck() {
  const missing = [
    !process.env.STRIPE_SECRET_KEY?.startsWith("sk_") && "STRIPE_SECRET_KEY",
    !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_") &&
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  ].filter(Boolean) as string[];

  if (missing.length === 0) return null;

  return (
    <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-medium">Setup needed — payments won&apos;t work yet</p>
      <p className="mt-2">
        Missing in <code className="font-mono">.env.local</code>:{" "}
        {missing.map((key) => (
          <code key={key} className="mr-2 font-mono">
            {key}
          </code>
        ))}
      </p>
      <p className="mt-2">
        Copy <code className="font-mono">.env.local.example</code> to{" "}
        <code className="font-mono">.env.local</code>, paste your test keys from{" "}
        <a
          className="underline"
          href="https://dashboard.stripe.com/test/apikeys"
          target="_blank"
          rel="noopener noreferrer"
        >
          the Stripe Dashboard
        </a>
        , then restart the dev server.
      </p>
    </div>
  );
}
