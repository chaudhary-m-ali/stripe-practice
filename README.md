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
trial     → POST /api/stripe/trial      (no Checkout, no card)
          → subscriptions.create({ trial_period_days: 14 }) → status "trialing"
          → redirect to /premium
Stripe    → checkout.session.completed → POST /api/webhook
          → service-role upsert into public.subscriptions
/premium  → reads subscriptions.status → renders or redirects
```

## The 14-day free trial

The pricing cards lead with **Start 14-day free trial** on both monthly and
yearly. No card is collected — the user goes straight from the button to
`/premium`.

```
day 0   POST /api/stripe/trial → stripe.subscriptions.create({
          trial_period_days: 14,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        })                                              → status "trialing"
        "trialing" is already in ACTIVE_STATUSES, so /premium unlocks.

day 14  no card on file → Stripe cancels the subscription
        → customer.subscription.updated → webhook writes status "canceled"
        → /premium locks again, nothing was ever charged
```

There is **no expiry check of ours anywhere** — no cron, no "is the trial over"
branch in the page. The trial ends because Stripe cancels it and the webhook
writes that down, exactly like a cancellation would.

`missing_payment_method` is what makes a card-less trial possible at all.
Without it Stripe rejects the create call: it can't start a trial when it has
no idea what to do on the last day.

**Mid-trial the trial button becomes "Add payment method"**, which opens a
Checkout Session in `mode: "setup"` — the same hosted card form and 3DS, but it
saves the card instead of charging it. The webhook attaches it to the
subscription, and on day 14 the trial converts to paid instead of cancelling.

One trial per account, enforced server-side by `profiles.trial_started_at`.
That column is stamped *before* the Stripe call, so two fast clicks can't
produce two subscriptions, and handed back if Stripe then fails. `profiles` has
no update policy, so it can't be cleared from the browser.

State the UI reads (all from Supabase, see [lib/trial.ts](lib/trial.ts)):

| | Pricing card CTA | /premium |
| --- | --- | --- |
| Never trialed | Start 14-day free trial | locked |
| Trialing, no card | Add payment method | open, with days-left banner |
| Trialing, card added | Trial — card on file | open |
| Trial ended | Subscribe *(trial used)* | locked, "your trial has ended" |
| Paid | Current plan | open |

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
| `NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL` | *optional* — [portal settings](https://dashboard.stripe.com/test/settings/billing/portal) → the shareable login link |

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

There are two doors into the portal, and they aren't equivalent:

| | `billingPortal.sessions.create()` | The login link |
| --- | --- | --- |
| URL | minted per customer, short-lived | one page, shared by everyone |
| Who is it? | Stripe already knows | customer types their email |
| Getting in | opens immediately | wait for a magic link email |
| Needs | portal configured via API/dashboard | just the link |

"Manage billing" always tries the API session first — the signed-in user is
already identified, so making them prove it by email again is a downgrade. Set
`NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL` and the login link becomes the
fallback: if the session call fails (test-mode portal never configured, most
often), the button explains the extra step and offers the link instead of
showing an error.

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

### …and the trial

1. A fresh account → **Start 14-day free trial** → straight to `/premium`, no
   card form anywhere
2. `/account` shows `trialing`, *Card on file: no*, and the end date
3. Don't want to wait 14 days? End it now — the subscription id is on
   `/account`:

   ```bash
   stripe subscriptions update sub_xxx --trial-end now
   ```

   `stripe listen` prints `customer.subscription.updated`, the row flips to
   `canceled`, and `/premium` locks itself. No invoice, no charge.
4. Or start another trial, hit **Add payment method**, pay with
   `4242 4242 4242 4242` (nothing is charged), then run the same command — this
   time it converts to `active` and bills.

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

lib/plans.ts                      price ids, trial length, unlocking statuses
lib/profile.ts                    read the current user's name/email/customer id
lib/stripe.ts                     server Stripe client (secret key)
lib/stripe-customer.ts            one Stripe customer per Supabase user
lib/subscription.ts               read the current user's plan
lib/trial.ts                      trial state: active / eligible / expired
lib/sync-subscription.ts          Stripe subscription → Supabase row
lib/supabase/{server,client,admin}.ts

app/page.tsx                      home + pricing
app/premium/page.tsx              the gated page
app/account/page.tsx              status + manage billing
app/login/                        sign in / sign up (Server Actions)
app/api/stripe/subscribe/route.ts creates the subscription Checkout Session
app/api/stripe/trial/route.ts     starts the card-less 14-day trial
app/api/stripe/payment-method/    Setup session to add a card mid-trial
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
- **A trial with no card still has to be able to end.** That's what
  `trial_settings.end_behavior.missing_payment_method` is for. Set it and
  Stripe owns the expiry; skip it and you're writing a cron job that scans for
  overdue trials — and getting it wrong on the day your worker is down.
- **Checkout is for collecting cards.** A free trial collects nothing, so it
  doesn't go through Checkout at all — the subscription is created directly and
  the user is on `/premium` in one hop. `mode: "setup"` is the reverse: a card
  form with no charge.
- **Give the trial away before you create it.** `trial_started_at` is written
  before the Stripe call and rolled back if it fails. Writing it after would
  let a double-click buy two subscriptions.
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
