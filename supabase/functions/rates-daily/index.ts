// Daily exchange rates: stores how many units of each currency one pound buys, then
// fills in any paid amount that was waiting for that day's rate. Run once a day by pg_cron.
// Source: ExchangeRate-API's open access endpoint (free, no key; attribution shown in the app).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SOURCE = "https://open.er-api.com/v6/latest/GBP";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const res = await fetch(SOURCE);
  if (!res.ok) return json({ ok: false, error: `rates source answered ${res.status}` }, 502);
  const body = await res.json();
  if (body.result !== "success" || typeof body.rates !== "object") {
    return json({ ok: false, error: "rates source returned no rates" }, 502);
  }
  const onDate = new Date(body.time_last_update_unix * 1000).toISOString().slice(0, 10);

  const { data: currencies, error: curError } = await db.from("currencies").select("code");
  if (curError || !currencies) return json({ ok: false, error: curError?.message ?? "no currencies" }, 500);

  const rows = currencies
    .filter((c) => c.code !== "GBP" && Number(body.rates[c.code]) > 0)
    .map((c) => ({ on_date: onDate, currency: c.code, per_gbp: body.rates[c.code], source: "open.er-api.com" }));
  const missing = currencies.filter((c) => c.code !== "GBP" && !(Number(body.rates[c.code]) > 0)).map((c) => c.code);

  // The first rates stored for a day are kept, so a rerun never changes them.
  const { error: upError } = await db.from("rates").upsert(rows, { onConflict: "on_date,currency", ignoreDuplicates: true });
  if (upError) return json({ ok: false, error: upError.message }, 500);

  const { data: stillWaiting } = await db.rpc("fill_missing_locks");
  return json({ ok: true, onDate, stored: rows.length, missing, stillWaiting });
});
