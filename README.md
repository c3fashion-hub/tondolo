# Tondolo

Wedding money abroad, sorted. A phone-first web app for couples marrying in one country and paying from another.

Project rules, sources of truth and decisions: see [CLAUDE.md](CLAUDE.md).

## Stack

- Next.js (App Router, TypeScript) on Netlify
- Supabase (London, eu-west-2): sign-in, database with row-level security, private storage
- Design system tokens and components in `src/app/globals.css` and `src/components/ui`

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
npm run typecheck
npm test               # unit tests (Node's built-in runner)
npm run build && npm run test:e2e   # browser tests against the production build
```

## Build stages

1. Foundations and the look: project, design tokens and components, welcome and setup screen, installable to the home screen.
2. Sign-in, weddings and sharing (this stage): email code or link, the five places and their rights, invites, Settings. 3. Payments, budget and currencies. 4. Overview and the health check. 5. Protecting payments. 6. Scanning and contract checks. 7. Reminders and calendar. 8. Voice notes, briefing and questions. 9. Checkout with Stripe. 10. Notices, privacy and your data.
