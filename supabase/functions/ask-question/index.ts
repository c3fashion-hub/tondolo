// Answers a question about one wedding, drawn only from that wedding's own facts as the person
// asking is allowed to see them (planners never get the couple's notes). The answer is shown and
// read aloud by the phone. Nothing is saved except one use of the allowance.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { ASK_SCHEMA, ASK_SYSTEM, cleanAnswer, factsText, type AskResult, type Facts } from "../_shared/notes.ts";
import { claimRefusal, cors, reply, todayIn } from "../_shared/http.ts";

const MODEL = "claude-opus-5-5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "method" });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return reply(req, 503, { error: "not_configured" });
  const auth = req.headers.get("Authorization");
  if (!auth) return reply(req, 401, { error: "signed_out" });

  let body: { wedding_id?: string; question?: string };
  try { body = await req.json(); } catch { return reply(req, 400, { error: "bad_request" }); }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!body.wedding_id || !/^[0-9a-f-]{36}$/i.test(body.wedding_id) || !question) return reply(req, 400, { error: "bad_request" });
  if (question.length > 500) return reply(req, 413, { error: "too_long" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: usage, error: claimError } = await db.rpc("claim_ai_use", { p_wedding: body.wedding_id, p_kind: "question" });
  if (claimError) { const r = claimRefusal(claimError.message); return reply(req, r.status, { error: r.code }); }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const giveBack = () => admin.rpc("release_document_read", { p_usage: usage });

  try {
    const { data: facts, error } = await db.rpc("wedding_facts", { p_wedding: body.wedding_id, p_today: todayIn() });
    if (error || !facts) { await giveBack(); return reply(req, 403, { error: "not_allowed" }); }

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    // deno-lint-ignore no-explicit-any
    const response: any = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ASK_SCHEMA } },
      system: ASK_SYSTEM,
      messages: [{
        role: "user",
        content: `<facts>\n${factsText(facts as Facts)}\n</facts>\n\n<question>\n${question.replace(/<\/?(facts|question)>/gi, "")}\n</question>`,
      }],
    // deno-lint-ignore no-explicit-any
    } as any);

    if (response.stop_reason !== "end_turn") { await giveBack(); return reply(req, 422, { error: "unreadable" }); }
    const text = response.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    let parsed: AskResult;
    try { parsed = JSON.parse(text); } catch { await giveBack(); return reply(req, 422, { error: "unreadable" }); }
    return reply(req, 200, { result: cleanAnswer(parsed) });
  } catch (e) {
    await giveBack();
    console.error("ask-question failed", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    return reply(req, e instanceof Anthropic.RateLimitError ? 503 : 502, { error: "busy" });
  }
});
