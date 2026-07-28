/**
 * Server Component — runs on the server, so it can check that each secret is
 * present (never printing its value) and tell you what's still missing.
 */
const CHECKS: { key: string; prefix?: string; what: string }[] = [
  {
    key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    prefix: "pk_",
    what: "Stripe → Developers → API keys",
  },
  {
    key: "STRIPE_SECRET_KEY",
    prefix: "sk_",
    what: "Stripe → Developers → API keys",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    prefix: "http",
    what: "Supabase → Project Settings → API",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    what: "Supabase → Project Settings → API",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    what: "Supabase → Project Settings → API (keep it secret)",
  },
];

export function SetupCheck() {
  const missing = CHECKS.filter(({ key, prefix }) => {
    const value = process.env[key];
    if (!value || value.startsWith("paste_")) return true;
    return prefix ? !value.startsWith(prefix) : false;
  });

  if (missing.length === 0) return null;

  return (
    <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-medium">Setup needed — this won&apos;t work yet</p>
      <p className="mt-2">
        Still missing from <code className="font-mono">.env.local</code>:
      </p>
      <ul className="mt-2 space-y-1">
        {missing.map(({ key, what }) => (
          <li key={key}>
            <code className="font-mono">{key}</code>{" "}
            <span className="opacity-80">— {what}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3">
        Fill them in, then restart the dev server. Full walkthrough is in{" "}
        <code className="font-mono">README.md</code>.
      </p>
    </div>
  );
}
