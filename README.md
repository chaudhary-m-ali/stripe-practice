# Stripe Practice

A small Next.js app for learning how Stripe payments actually work. It implements
the two flows you'd pick between in a real product, plus webhooks — all in **test
mode**, so no real money moves.

## Setup

1. **Get your test keys** — [Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys)
   with the *Test mode* toggle on. You want the publishable key (`pk_test_…`) and
   the secret key (`sk_test_…`).

2. **Create `.env.local`**:

   ```bash
   cp .env.local.example .env.local
   ```

   Then paste your keys in. `.env*` is gitignored — the secret key must never be
   committed, and must never be prefixed with `NEXT_PUBLIC_`.

3. **Run it**:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Test cards

| Number                | What happens                      |
| --------------------- | --------------------------------- |
| `4242 4242 4242 4242` | Succeeds immediately              |
| `4000 0025 0000 3155` | Requires 3D Secure authentication |
| `4000 0000 0000 9995` | Declined — insufficient funds     |
| `4000 0000 0000 0002` | Declined — generic card decline   |

Any future expiry date, any 3-digit CVC, any postal code.
[Full list](https://docs.stripe.com/testing).

## The three flows

### 1. Stripe Checkout — hosted (`/checkout`)

Least code, most Stripe-managed. You never render a card field.

```
browser  POST /api/checkout-session { productId }
server   stripe.checkout.sessions.create({ line_items, success_url, cancel_url })
browser  window.location = session.url        → checkout.stripe.com
stripe   redirect → /success?session_id={CHECKOUT_SESSION_ID}
server   stripe.checkout.sessions.retrieve(id) → read payment_status
```

Files: [app/api/checkout-session/route.ts](app/api/checkout-session/route.ts),
[app/checkout/](app/checkout/), [app/success/page.tsx](app/success/page.tsx)

### 2. Payment Element — embedded (`/elements`)

The form lives on your page (inside Stripe-hosted iframes, so PCI scope stays
with Stripe). More control over the UI.

```
browser  POST /api/payment-intent { productId }
server   stripe.paymentIntents.create({ amount, currency }) → client_secret
browser  <Elements options={{ clientSecret }}><PaymentElement /></Elements>
browser  stripe.confirmPayment({ elements, confirmParams: { return_url } })
stripe   resolves inline, or redirects → /payment-status?payment_intent=…
```

Files: [app/api/payment-intent/route.ts](app/api/payment-intent/route.ts),
[app/elements/](app/elements/), [app/payment-status/page.tsx](app/payment-status/page.tsx)

### 3. Webhooks (`/api/webhook`)

The redirect back to your site can be lost — the buyer closes the tab, the
network drops. Stripe *also* posts the event server-to-server and retries until
you return a 2xx. **Fulfil orders here**, not on the success page.

```bash
# one-time: https://docs.stripe.com/stripe-cli
stripe login
stripe listen --forward-to localhost:3000/api/webhook
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`, restart `npm run dev`,
then pay for something and watch the events land in your terminal. You can also
fire one by hand:

```bash
stripe trigger payment_intent.succeeded
```

File: [app/api/webhook/route.ts](app/api/webhook/route.ts)

## Things worth internalising

- **Amounts are integers in the smallest currency unit.** `$19.00` is `1900`.
- **Never take the amount from the client.** The browser sends a product id; the
  server looks up the price in [lib/products.ts](lib/products.ts).
- **`client_secret` is not the secret key.** It authorises exactly one
  PaymentIntent and is meant to be in the browser. `sk_test_…` never is.
- **Verify webhook signatures against the raw body.** Use `await request.text()`,
  not `.json()` — re-serialising changes the bytes and the signature check fails.
- **Query strings are hints, not truth.** `/success` and `/payment-status` both
  re-fetch the object from Stripe rather than trusting `?redirect_status=`.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 ·
`stripe` (server SDK) · `@stripe/stripe-js` + `@stripe/react-stripe-js` (browser).
