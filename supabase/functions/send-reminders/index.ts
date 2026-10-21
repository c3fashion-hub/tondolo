// Sends due-date reminders (14 and 3 days before) and weekly summaries, once a day via pg_cron.
// Every email sent is logged, so a rerun or a missed day never sends anything twice. With
// { "test": true, "wedding_id": … } and a signed-in person, sends that person a test reminder
// to their own address only. Emails go through Resend; its key stays in Supabase's secrets.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { reminderEmail, summaryEmail, todayIn, type DueItem, type Email } from "../_shared/emails.ts";
import { cors } from "../_shared/http.ts";

const FROM = Deno.env.get("REMINDER_FROM") ?? "Tondolo <hello@tondolo.app>";
const APP = (Deno.env.get("APP_URL") ?? "https://tondolo.app").replace(/\/$/, "");


type Outgoing = { to: string; email: Email; log: { wedding_id: string; member_id: string; payment_id: string | null; kind: string; sent_for: string }[] };

// Resend's batch endpoint takes up to 100 emails; a failed batch is retried by tomorrow's run.
async function send(key: string, out: Outgoing[]): Promise<Outgoing[]> {
  const sent: Outgoing[] = [];
  for (let i = 0; i < out.length; i += 100) {
    const chunk = out.slice(i, i + 100);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk.map((o) => ({ from: FROM, to: [o.to], subject: o.email.subject, text: o.email.text, html: o.email.html }))),
    });
    if (res.ok) sent.push(...chunk); else console.error("send-reminders: Resend answered", res.status, await res.text());
  }
  return sent;
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return json(null);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ ok: false, error: "not_configured" }, 503);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const today = todayIn("Europe/London");
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  // A test reminder to the signed-in person's own address, nobody else's.
  if (body.test) {
    const auth = req.headers.get("Authorization") ?? "";
    const { data: { user } } = await admin.auth.getUser(auth.replace(/^Bearer /, ""));
    if (!user?.email || typeof body.wedding_id !== "string") return json({ ok: false, error: "signed_out" }, 401);
    const { data: me } = await admin.from("members").select("id, display_name, role, wedding_id, weddings(names)")
      .eq("wedding_id", body.wedding_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!me) return json({ ok: false, error: "not_allowed" }, 403);
    const { data: recent } = await admin.from("alert_log").select("id").eq("member_id", me.id).eq("kind", "test")
      .gte("sent_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((recent?.length ?? 0) >= 3) return json({ ok: false, error: "too_many" }, 429);
    const sample: DueItem = { title: "Test payment", amount_minor: 10_000, currency: "EUR", minor_digits: 2, home_minor: null, home_currency: "EUR",
      home_minor_digits: 2, due_on: new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10), days_left: 3, supplier_name: null, payer_name: null };
    // deno-lint-ignore no-explicit-any
    const names = (me as any).weddings?.names ?? null;
    const email = reminderEmail({ displayName: me.display_name, names, items: [sample],
      paymentsUrl: `${APP}/w/${me.wedding_id}/payments`, settingsUrl: `${APP}/w/${me.wedding_id}/settings` });
    email.subject = `Test: ${email.subject}`;
    const ok = await send(key, [{ to: user.email, email, log: [] }]);
    if (!ok.length) return json({ ok: false, error: "busy" }, 502);
    await admin.from("alert_log").insert({ wedding_id: me.wedding_id, member_id: me.id, kind: "test", sent_for: today });
    return json({ ok: true, to: user.email });
  }

  // Due-date reminders: one email per person per wedding, listing everything due for them.
  const { data: due, error: dueError } = await admin.rpc("reminders_to_send", { p_today: today });
  if (dueError) return json({ ok: false, error: dueError.message }, 500);
  const groups = new Map<string, typeof due>();
  for (const r of due ?? []) groups.set(`${r.member_id}:${r.wedding_id}`, [...(groups.get(`${r.member_id}:${r.wedding_id}`) ?? []), r]);
  const out: Outgoing[] = [...groups.values()].map((rows) => {
    const r0 = rows[0];
    return {
      to: r0.email,
      email: reminderEmail({
        displayName: r0.display_name, names: r0.names,
        items: rows.map((r: Record<string, unknown>) => ({
          title: r.title, amount_minor: Number(r.amount_minor), currency: r.currency, minor_digits: r.minor_digits,
          home_minor: r.home_minor === null ? null : Number(r.home_minor), home_currency: r.home_currency, home_minor_digits: r.home_minor_digits,
          due_on: r.due_on, days_left: r.days_left, supplier_name: r.supplier_name, payer_name: r.payer_name,
        }) as DueItem),
        paymentsUrl: `${APP}/w/${r0.wedding_id}/payments`, settingsUrl: `${APP}/w/${r0.wedding_id}/settings`,
      }),
      log: rows.map((r: Record<string, string>) => ({ wedding_id: r.wedding_id, member_id: r.member_id, payment_id: r.payment_id, kind: r.kind, sent_for: r.due_on })),
    };
  });

  // Weekly summaries, on each wedding's check-in day.
  const { data: weekly, error: weeklyError } = await admin.rpc("summaries_to_send", { p_today: today });
  if (weeklyError) return json({ ok: false, error: weeklyError.message }, 500);
  for (const s of weekly ?? []) {
    out.push({
      to: s.email,
      email: summaryEmail({
        displayName: s.display_name, names: s.names, destination: s.destination, weddingDate: s.wedding_date, today,
        homeCurrency: s.home_currency, homeDigits: s.home_minor_digits, committed: Number(s.committed), paid: Number(s.paid),
        checkinTime: s.checkin_time, dueSoon: s.due_soon, overdue: s.overdue,
        overviewUrl: `${APP}/w/${s.wedding_id}`, settingsUrl: `${APP}/w/${s.wedding_id}/settings`,
      }),
      log: [{ wedding_id: s.wedding_id, member_id: s.member_id, payment_id: null, kind: "weekly", sent_for: today }],
    });
  }

  const sent = await send(key, out);
  const log = sent.flatMap((o) => o.log);
  if (log.length) {
    const { error } = await admin.from("alert_log").insert(log);
    if (error) {
      // One row already logged (two runs overlapping) fails the batch; log the rest one by one.
      for (const row of log) await admin.from("alert_log").insert(row);
    }
  }
  return json({ ok: true, today, reminders: groups.size, summaries: weekly?.length ?? 0, sent: sent.length, failed: out.length - sent.length });
});
