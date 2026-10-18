# Scanning and contract checks: setup

Scanning reads quotes, invoices, receipts and contracts with Claude (Anthropic), from a Supabase
Edge Function called `read-document`. The API key lives only in Supabase's secrets: never in the
app, the repository, Netlify or a chat.

## 1. Create the API key (Anthropic Console)

1. Go to https://console.anthropic.com, open **Settings → Limits** and set a **monthly spend limit**
   (for example £50 to start).
2. Open **API keys → Create key**, name it `tondolo-scanning`, and copy it.

## 2. Add it to Supabase (not Netlify)

1. Supabase dashboard → project **tondolo** → **Edge Functions → Secrets**.
2. Add `ANTHROPIC_API_KEY` with the key you copied, and save.
3. Add `APP_ORIGINS` with `https://tondolo.app` (add `,http://localhost:3000` if you test locally).

Until the key is added, scanning answers "Scanning isn't switched on yet. Add the payments by hand
for now." and nothing is charged.

## How it works

- The phone shrinks photos, then uploads each document to the private `documents` bucket (London),
  in a folder for the wedding. Only the couple and the planner can open it.
- `read-document` checks the wedding's allowance (1 document on the free start, 100 once unlocked),
  reads the document with `claude-opus-5-5`, and returns what it found. If reading fails on our side,
  the allowance is given back.
- Nothing is saved as a payment or contract check until a person presses "Add N payments" or
  "Save the contract check" on the review screen, which always shows: "We read this automatically.
  Check every amount and date before you save."
- Deleting a document, or the wedding, queues its file; `purge-documents` deletes queued files
  every hour (pg_cron, minute 25).

## Privacy policy (stage 10)

Documents are sent to Anthropic in the US to be read, and are not used to train models. The privacy
policy must say so.
