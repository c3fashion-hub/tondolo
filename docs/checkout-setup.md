# Checkout setup (Stripe, test mode)

Tondolo is sold through Stripe Checkout with **Managed Payments**: Stripe is the merchant of record,
so it works out, collects and pays VAT and sales tax in every country. Prices include tax:
**£49, US$59, €55**. Stripe stays in **test mode** until Mags says go live; the `checkout` function
refuses any live key.

## Already done
- `STRIPE_SECRET_KEY` (a `sk_test_` key) is in Supabase → Edge Functions → Secrets.
- The `checkout` and `stripe-webhook` functions are deployed.

## 1. The webhook (one-off, about two minutes)
The webhook is how Stripe tells Tondolo a payment went through, even if the buyer closes the page.
1. In the Stripe dashboard (test mode on), go to **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://znxpxkbmgcztswupnaez.supabase.co/functions/v1/stripe-webhook`
3. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`.
4. Save, then copy the **signing secret** (starts `whsec_`).
5. In Supabase → Edge Functions → Secrets, add `STRIPE_WEBHOOK_SECRET` with that value. Never paste it in chat.

Until the webhook is set, the return page still unlocks the wedding (it checks the payment with
Stripe directly); the webhook covers anyone who closes the page early.

## 2. The name on card statements
Stripe → **Settings → Business → Public details**: set the statement descriptor to `TONDOLO`.

## 3. Try it
Open a wedding as its owner → Payments → **Unlock Tondolo** → Pay. On Stripe's page use card
`4242 4242 4242 4242`, any future date, any 3 digits, any postcode. You come back to "Tondolo is unlocked".

## Before going live (Mags decides)
- Mags says go live; then change `TEST_MODE` in `src/lib/billing.ts`, allow live keys in
  `supabase/functions/_shared/billing.ts` and the `checkout` function (`cs_live_` sessions), and
  add the live key and a live webhook.
- Check Stripe's Managed Payments terms for buyers (refunds) and the fee.
- The cancellation wording at checkout (no refunds) needs Mags's approved legal wording.
