# Stripe Practice — subscriptions with Supabase auth

A Next.js app where signed-in users on a **Premium** plan (monthly or yearly)
can reach a gated `/premium` page, and free users can't. Supabase owns accounts
and data, Stripe owns billing, and a webhook keeps the two in sync.

Everything runs on Stripe **test keys** — no real money moves.

```
signup    → Supabase auth.users → trigger creates a profiles row
subscribe → POST /api/stripe/subscribe  (browser sends "monthly" | "yearly", nothing else)
          → getOrCreateStripeCustomer() → checkout.sessions.create({ mode: "subscription" })
          → redirect to checkout.stripe.com
Stripe    → checkout.session.completed → POST /api/webhook
          → service-role upsert into public.subscriptions
/premium  → reads subscriptions.status → renders or redirects
```

## Setup

### 1. Environment

```bash
cp .env.local.example .env.local
```

| Variable                             | Where to get it                                          |
| ------------------------------------ | -------------------------------------------------------- |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | [Stripe → API keys](https://dashboard.stripe.com/test/apikeys) (`pk_test_…`) |
| `STRIPE_SECRET_KEY`                  | same page (`sk_test_…`) — **secret**                      |
| `STRIPE_WEBHOOK_SECRET`              | printed by `stripe listen` (step 4)                       |
| `NEXT_PUBLIC_SUPABASE_URL`           | Supabase → Project Settings → API                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | same page — safe in the browser, RLS still applies        |
| `SUPABASE_SERVICE_ROLE_KEY`          | same page — **bypasses RLS**, webhook only                |

`.env*` is gitignored. Never prefix a secret with `NEXT_PUBLIC_`.

### 2. Database

Open your Supabase project → **SQL Editor** → New query → paste all of
[supabase/schema.sql](supabase/schema.sql) → **Run**.

That creates `profiles` and `subscriptions`, turns on Row Level Security, and
adds a trigger that copies the signup form's name and email into a profile row.

The file is **safe to re-run** — every statement is idempotent (`create table if
not exists`, `add column if not exists`, `create or replace function`, `drop
policy if exists`). When the schema changes, paste the whole thing again and it
migrates in place instead of failing.

### 3. Auth settings

Supabase → **Authentication → Sign In / Providers → Email**.

For local practice, turn **Confirm email** *off* so signing up logs you straight
in. Leave it on and you'll need to click a link in an email first — which also
works, via [app/auth/callback/route.ts](app/auth/callback/route.ts).

### 4. Webhook

Without this the database never learns about payments, and `/premium` stays
locked even after a successful checkout.

```bash
# one-time install: https://docs.stripe.com/stripe-cli
stripe login
stripe listen --forward-to localhost:3000/api/webhook
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

### 5. Billing portal

One-time, so "Manage billing" works:
[Stripe → Settings → Billing → Customer portal](https://dashboard.stripe.com/test/settings/billing/portal)
→ activate the test-mode link.

### 6. Run

```bash
npm run dev
```

Keep `stripe listen` running in a second terminal.

## Plans

Under the **stripe tutorial** product in your Stripe account:

| Plan            | Price ID                            | Amount        |
| --------------- | ----------------------------------- | ------------- |
| Premium monthly | `price_1Ty5u6LDG4sRXhAhPwG6b1aT`    | $10.00 / month |
| Premium yearly  | `price_1Ty7aLLDG4sRXhAhmpA8ueMC`    | $99.00 / year  |

Both live in [lib/plans.ts](lib/plans.ts). Free is the absence of a row in
`subscriptions` — there's no Stripe object for it.

## Try it

1. `/login` → **Create account** → full name, email, password
2. Home → **Subscribe monthly** → pay with `4242 4242 4242 4242`
3. Watch `stripe listen` print `checkout.session.completed`
4. `/premium` now renders; `/account` shows status, plan and renewal date
5. **Manage billing** → cancel → `customer.subscription.updated` fires →
   `/account` flips to "Access until …" with no code of ours in between

## Test cards

| Number                | What happens                        |
| --------------------- | ----------------------------------- |
| `4242 4242 4242 4242` | Succeeds immediately                |
| `4000 0025 0000 3155` | Requires 3D Secure authentication   |
| `4000 0000 0000 9995` | Declined — insufficient funds       |
| `4000 0000 0000 0341` | Attaches, then fails on renewal     |

Any future expiry, any 3-digit CVC. [Full list](https://docs.stripe.com/testing).

## Layout

```
proxy.ts                          session refresh + redirect signed-out users
supabase/schema.sql               tables, RLS, triggers

lib/plans.ts                      price ids, which statuses unlock premium
lib/profile.ts                    read the current user's name/email/customer id
lib/stripe.ts                     server Stripe client (secret key)
lib/stripe-customer.ts            one Stripe customer per Supabase user
lib/subscription.ts               read the current user's plan
lib/supabase/{server,client,admin}.ts

app/page.tsx                      home + pricing
app/premium/page.tsx              the gated page
app/account/page.tsx              status + manage billing
app/login/                        sign in / sign up (Server Actions)
app/api/stripe/subscribe/route.ts creates the subscription Checkout Session
app/api/stripe/portal/route.ts    opens the Stripe billing portal
app/api/webhook/route.ts          syncs Stripe → Supabase
```

## One-off payment demos

Separate from the subscription flow, no account needed — `mode: "payment"`
instead of `"subscription"`:

- `/checkout` — hosted Checkout ([route](app/api/checkout-session/route.ts))
- `/elements` — embedded Payment Element ([route](app/api/payment-intent/route.ts))

## Things worth internalising

- **Never trust the client for money.** The browser posts `"monthly"`, not a
  price or an amount. The price id is resolved server-side in `lib/plans.ts`.
- **The database is the gate, Stripe is the source.** `/premium` reads one
  indexed row instead of calling Stripe on every request; the webhook is what
  keeps that row true.
- **The redirect is not the event.** Renewals, failed cards and cancellations
  happen months later with no browser open. Only the webhook sees them.
- **`subscriptions` has no write policy.** Users can read their own row and
  nothing else; only the service-role webhook writes. A user cannot grant
  themselves premium by calling the Supabase API from devtools.
- **`current_period_end` moved.** On API version `2026-06-24.dahlia` it lives on
  `subscription.items.data[0]`, not on the subscription. Older tutorials read
  `subscription.current_period_end`, which is `undefined` here.
- **Verify webhooks against the raw body.** `await request.text()`, never
  `.json()` — re-serialising changes the bytes and the signature check fails.
- **`getUser()`, not `getSession()`.** `getSession()` trusts the cookie;
  `getUser()` revalidates the JWT with Supabase.
- **Signup extras ride along in `options.data`.** Full name goes into
  `auth.users.raw_user_meta_data`, and the `handle_new_user` trigger copies it
  into `profiles.full_name`. One insert, no second round trip — and no window
  where a user exists without a profile.

## Stack

Next.js 16 (App Router, Turbopack, `proxy.ts`) · React 19 · Tailwind CSS v4 ·
`stripe` 22 · `@supabase/ssr` + `@supabase/supabase-js`.
