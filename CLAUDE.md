# Tondolo: project rules

## What we're building
A phone-first web app (installable to the home screen) that tracks wedding payments in every currency, reminds couples before money is due, and helps protect it. One price: £49, including the Protection Kit. Sold direct through Stripe Checkout.

## Sources of truth
- Look and wording: the Tondolo design system (https://claude.ai/artifact/NoqzdEeRny47hqec7q3DjX) and the app screens (https://claude.ai/artifact/M4uRZxt2zDdoygAmxJr9cu). Use its tokens and components; never invent colours or fonts.
- Features and rules: the product specification (https://claude.ai/code/artifact/3c3331c9-574d-48fc-9a05-84fa85fa2a17), including its "Protection and tax rules" section.
- Protection content: the Protection Kit (https://claude.ai/code/artifact/7647a5d0-e3c3-4cd4-bc66-9ac5899bca77). It is the source of truth for the six-point booking message, clauses and templates.
- Behaviour reference only: the prototype (https://claude.ai/artifact/NG4dB7Q8hbTb7oDMjfSbN6). Never copy its styling.
- If the screens and the spec disagree, stop and ask.

## Money
- Store every amount in minor units (pence, cents) with its currency code. Never use floating-point numbers for money.
- Unpaid amounts convert at today's rate; paid amounts are locked at the rate worked out from the exact amount on the bank or card statement, or the rate on the day paid until that's entered. A locked rate never changes.
- Show the currency charged and the home-currency value side by side.
- Estimates never count as committed.
- Money at risk = money already paid that isn't covered by a protected payment method or by the supplier's level protections. Count each pound once; never count money not yet paid.

## Roles
- Owner: the partner who bought Tondolo. Partner rights plus billing and deleting the wedding.
- Partner: everything.
- Planner: everything except the couple's notes; budget but not settings; can't invite.
- Family member: overall progress and their own contributions only; adds and edits only payments they cover.
- Notes are private to the two partners.

## Security and privacy
- Row-level security on every table. A person only ever sees weddings they belong to, with the rights of their role.
- Every API key stays on the server. Nothing secret in the browser, the repo or the chat.
- Uploaded documents and voice-note text are private to the wedding and deleted when the wedding is deleted. Keep the words of a voice note, never the recording.
- Data is stored in the UK or EU (Supabase project `tondolo`, London, eu-west-2). Requests are processed in the US by Netlify functions and Anthropic; the privacy policy says so.
- Stripe stays in test mode until Mags says go live. Refuse to run with a live key before then.

## AI features
- Scanning, contract checks, voice notes and questions call the Anthropic API from the server only.
- Nothing the AI suggests is saved until a person confirms it.
- Every AI result shows: "We read this automatically. Check every amount and date before you save."
- Free start: 1 scan. Paid: cap AI use per wedding (about 100 scans) and fail politely when the cap is reached.

## Voice
- At launch: voice notes use the phone keyboard's dictation; the briefing and answers use the phone's built-in voice. No speech supplier.

## Wording
- Follow the design system's voice: calm, warm, plain British English.
- Never promise that money is safe or protected. Say what the couple can do, not what Tondolo guarantees.
- Statuses always use words, never colour alone.
- UK guidance (Section 75, chargeback) only for UK cards; everyone else: "Check what protection your card or bank offers."

## Quality
- WCAG 2.2 AA, 44px tap targets, works from 320px wide.
- Write tests for money maths, rate locking, roles and reminders before moving to the next stage.
- Work in stages. Finish, test and show each stage before starting the next.

## Decisions Claude must not make alone
Prices, refunds and what's included; legal wording; tax; going live with Stripe; anything that sends messages to suppliers or family; deleting data beyond the couple's own "delete everything"; adding paid services.

## Commands
- `npm run dev`: local app on http://localhost:3000
- `npm run typecheck`, `npm test` (unit, Node's built-in runner), `npm run test:e2e` (Playwright, uses /opt/pw-browsers Chromium)
- `npm run build`: production build (what Netlify runs)
- Database: migrations in `supabase/migrations` (apply in order); role tests in `supabase/tests/roles_test.sql` (run in the SQL editor; it rolls back and ends with ALL ROLE TESTS PASSED)
- Money tests: `supabase/tests/money_test.sql` (conversion, rate locking, statement amounts, free limit, budgets; ends with ALL MONEY TESTS PASSED). The same conversion cases are in `tests/unit/rates-starter.test.ts`, so the app and database round identically.
- Rates: `supabase/functions/rates-daily` runs at 06:10 UTC via pg_cron (ExchangeRate-API open access, free, attribution shown next to converted amounts).
- Local preview of money screens with the example wedding: `TONDOLO_PREVIEW=1 npm start`, then `/dev/money` (payments) and `?screen=overview`, `first`, `health`, `budget`, `cash` or `supplier&id=s-rita` (404 on the live site). The browser tests run a second server with the preview on.
- Money health check: `src/lib/health.ts` (the approved formula), `src/lib/protection.ts` (levels, money at risk), `src/lib/tax.ts` (the Kit's IVA rates). `tests/unit/health.test.ts` pins the example wedding at 71.
- Protecting payments: `src/lib/messages.ts` (the Kit's six-point booking message: English and French word for word from the Kit, Portuguese and Spanish drafts to be proofread; receipt requests; WhatsApp and email links the couple send themselves), `src/lib/pay-safely.ts`, `src/lib/cash.ts`, `src/lib/claim-pack.ts` (PDF with pdf-lib). Tests in `tests/unit/protect.test.ts`.
- Scanning: `supabase/functions/read-document` (Claude reads one document; key in Supabase secrets, see `docs/scanning-setup.md`), shared schema and instructions in `supabase/functions/_shared/reading.ts`, review screens in `src/components/scan`, allowance in the database (`claim_document_read`). Document tests: `supabase/tests/documents_test.sql` (ends with ALL DOCUMENT TESTS PASSED). Preview: `/dev/money?screen=scan` and `?screen=contract`.
- `npm run test:live`: sharing flow against the real Supabase project with temporary test people (needs E2E_PASSWORD and network access to *.supabase.co)

## Sharing
- Invites are links the couple send themselves (WhatsApp, message or email from their own phone). Tondolo sends nothing to anyone on the couple's behalf.
- An invite link works once, for 14 days, and only for the invited email. Only a hash of the link is stored.
- Sign-in emails carry a 6-digit code and a link; the code keeps people inside the home-screen app on iPhone. Setup in `docs/sign-in-setup.md`.
