# Sign-in setup (Supabase dashboard)

Settings the code can't change. Project: **tondolo** (London). Never paste keys into a chat; type them into the dashboard.

## 1. Where sign-in links may go
Authentication → URL Configuration
- **Site URL:** `https://tondolo.app`
- **Redirect URLs:** add each of these
  - `https://tondolo.app/**`
  - `https://tondolo.netlify.app/**`
  - `https://*--tondolo.netlify.app/**`
  - `http://localhost:3000/**`

## 2. The sign-in email (code and link)
Authentication → Emails → Templates. Use the same subject and body for **Magic link** and **Confirm signup**.

Subject:
```
Your Tondolo sign-in code: {{ .Token }}
```

Body (paste into the HTML box):
```html
<div style="font-family: Helvetica, Arial, sans-serif; color: #1E1420; max-width: 480px;">
  <p style="font-size: 22px; font-weight: 700; color: #C2255C; margin: 0 0 16px;">tondolo</p>
  <p style="font-size: 16px; line-height: 24px;">Here's your code to sign in. Type it into Tondolo:</p>
  <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">{{ .Token }}</p>
  <p style="font-size: 16px; line-height: 24px;">Or, on the phone you're using, <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email" style="color: #C2255C; font-weight: 700;">tap here to sign in</a>.</p>
  <p style="font-size: 14px; line-height: 20px; color: #6A5A66;">The code works once, for an hour. If you didn't ask to sign in, you can ignore this email.</p>
</div>
```

Authentication → Sign In / Providers → Email: keep **Email OTP length** at 6.

## 3. Sending email from tondolo.app (Resend)
Supabase's built-in email only reaches people in your Supabase organisation, a few times an hour. To email anyone (partners, family, planners) it needs a sending service. Resend's free plan covers 3,000 emails a month.

1. Create a Resend account and add the domain `tondolo.app`.
2. Resend shows three or four DNS records (TXT and MX). Add them in Bluehost → Domains → tondolo.app → DNS, exactly as shown. Don't remove existing records.
3. When Resend says the domain is verified, create an API key (sending access only).
4. Supabase → Authentication → Emails → SMTP Settings → enable custom SMTP:
   - Sender email `hello@tondolo.app`, sender name `Tondolo`
   - Host `smtp.resend.com`, port `465`, username `resend`
   - Password: the Resend API key (typed here, nowhere else)
