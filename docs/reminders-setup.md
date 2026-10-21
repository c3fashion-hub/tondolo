# Reminder emails: setup

Reminders (14 and 3 days before each due date) and the weekly summary are sent by the Supabase Edge
Function `send-reminders`, every morning at 06:45 UTC (07:45 in British summer time), through Resend.

## 1. Resend (once, shared with sign-in emails)

If you haven't yet: create a Resend account, add the domain `tondolo.app`, and add the DNS records it
shows in Bluehost (see `docs/sign-in-setup.md`, step 3). Wait until Resend says the domain is verified.

## 2. Add the key to Supabase (not Netlify)

1. Resend → **API keys → Create** (sending access only). Copy it.
2. Supabase → project **tondolo** → **Edge Functions → Secrets**. Add:
   - `RESEND_API_KEY`: the key
   - `REMINDER_FROM`: `Tondolo <hello@tondolo.app>`
   - `APP_URL`: `https://tondolo.app`

Never paste the key into a chat or the code.

## 3. Check it works

Settings → **Your emails** → **Send me a test reminder**. It goes only to your own address. Then add a
payment due in 3 days with reminders on: the email arrives the next morning.

## Who gets what

- Each person chooses their own emails in Settings. Everyone has payment reminders on by default
  (Mags, 18 October 2026): the couple and planner for every payment, family only for the payments they
  cover. The weekly summary is opt-in, sent on the check-in day (Sunday if none); family don't get it.
- `APP_URL` is where links in the emails point: `https://tondolo.netlify.app` until tondolo.app is
  connected to the site, then `https://tondolo.app`.
- Every email sent is logged, so nothing is sent twice. Resend's free plan covers 3,000 emails a month
  and 100 a day; beyond that it's a paid plan (Mags's decision).
