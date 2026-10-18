// Reads one note (typed, or dictated with the phone's keyboard) and suggests what to file: a payment
// made, a detail agreed with a supplier, a reminder. Nothing is saved here except one use of the
// wedding's allowance; the app saves the note and each suggestion only after a person confirms.
// Only words arrive here, never a recording. The API key never leaves the server.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { NOTE_SCHEMA, NOTE_SYSTEM, cleanNote, notePrompt, type NoteContext, type NoteResult } from "../_shared/notes.ts";
import { claimRefusal, cors, reply, todayIn } from "../_shared/http.ts";

const MODEL = "claude-opus-5-5";

function decimal(minor: number, digits: number): string {
  if (!digits) return String(minor);
  const s = String(Math.abs(minor)).padStart(digits + 1, "0");
  const frac = s.slice(-digits).replace(/0+$/, "");
  return `${minor < 0 ? "-" : ""}${s.slice(0, -digits)}${frac ? `.${frac}` : ""}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "method" });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return reply(req, 503, { error: "not_configured" });
  const auth = req.headers.get("Authorization");
  if (!auth) return reply(req, 401, { error: "signed_out" });

  let body: { wedding_id?: string; words?: string };
  try { body = await req.json(); } catch { return reply(req, 400, { error: "bad_request" }); }
  const words = typeof body.words === "string" ? body.words.trim() : "";
  if (!body.wedding_id || !/^[0-9a-f-]{36}$/i.test(body.wedding_id) || !words) return reply(req, 400, { error: "bad_request" });
  if (words.length > 4000) return reply(req, 413, { error: "too_long" });

  // Acting as the signed-in person, so row-level security decides what they can read.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: usage, error: claimError } = await db.rpc("claim_ai_use", { p_wedding: body.wedding_id, p_kind: "note" });
  if (claimError) { const r = claimRefusal(claimError.message); return reply(req, r.status, { error: r.code }); }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const giveBack = () => admin.rpc("release_document_read", { p_usage: usage });

  try {
    const [wedding, suppliers, payments, currencies] = await Promise.all([
      db.from("weddings").select("home_currency, destination").eq("id", body.wedding_id).single(),
      db.from("suppliers").select("id, name").eq("wedding_id", body.wedding_id),
      db.from("payments").select("id, title, supplier_id, category, amount_minor, currency, status, due_on, is_estimate").eq("wedding_id", body.wedding_id),
      db.from("currencies").select("code, minor"),
    ]);
    if (wedding.error || !wedding.data) { await giveBack(); return reply(req, 404, { error: "not_found" }); }
    const digits = new Map((currencies.data ?? []).map((c) => [c.code, c.minor as number]));
    const rows = payments.data ?? [];
    const context: NoteContext = {
      today: todayIn(),
      homeCurrency: wedding.data.home_currency,
      destination: wedding.data.destination,
      suppliers: (suppliers.data ?? []).map((s) => ({
        id: s.id, name: s.name,
        categories: [...new Set(rows.filter((p) => p.supplier_id === s.id && p.category).map((p) => p.category as string))],
      })),
      unpaid: rows.filter((p) => p.status === "due").map((p) => ({
        id: p.id, title: p.title, supplier_id: p.supplier_id, category: p.category,
        amount: decimal(p.amount_minor, digits.get(p.currency) ?? 2), currency: p.currency, due_on: p.due_on,
      })),
    };

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    // deno-lint-ignore no-explicit-any
    const response: any = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: NOTE_SCHEMA } },
      system: NOTE_SYSTEM,
      messages: [{ role: "user", content: notePrompt(context, words) }],
    // deno-lint-ignore no-explicit-any
    } as any);

    if (response.stop_reason !== "end_turn") { await giveBack(); return reply(req, 422, { error: "unreadable" }); }
    const text = response.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    let parsed: NoteResult;
    try { parsed = JSON.parse(text); } catch { await giveBack(); return reply(req, 422, { error: "unreadable" }); }
    return reply(req, 200, { result: cleanNote(parsed, context) });
  } catch (e) {
    await giveBack();
    console.error("read-note failed", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    return reply(req, e instanceof Anthropic.RateLimitError ? 503 : 502, { error: "busy" });
  }
});
