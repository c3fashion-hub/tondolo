// Reads one uploaded document with Claude and returns what it found, for the couple to check.
// Nothing is saved here except one use of the wedding's allowance; the app saves payments or a
// contract check only after a person confirms them. The API key never leaves the server.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  CONTRACT_PROMPT, CONTRACT_SCHEMA, CONTRACT_SYSTEM, SCAN_PROMPT, SCAN_SCHEMA, SCAN_SYSTEM,
  cleanContract, cleanScan, type ContractResult, type ScanResult,
} from "../_shared/reading.ts";

const MODEL = "claude-opus-5-5";
const IMAGE_LIMIT = 5_000_000; // Claude reads images up to 5 MB; the app shrinks photos well below this
const ORIGINS = (Deno.env.get("APP_ORIGINS") ?? "https://tondolo.app").split(",").map((o) => o.trim());

function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// Every answer the app shows is plain, calm English; the code says which.
const reply = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "method" });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return reply(req, 503, { error: "not_configured" });
  const auth = req.headers.get("Authorization");
  if (!auth) return reply(req, 401, { error: "signed_out" });

  let body: { document_id?: string; mode?: string };
  try { body = await req.json(); } catch { return reply(req, 400, { error: "bad_request" }); }
  const mode = body.mode === "contract" ? "contract" : "scan";
  if (!body.document_id || !/^[0-9a-f-]{36}$/i.test(body.document_id)) return reply(req, 400, { error: "bad_request" });

  // Acting as the signed-in person, so row-level security decides what they can read.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: doc } = await db.from("documents").select("id, wedding_id, file_path, mime, size_bytes").eq("id", body.document_id).maybeSingle();
  if (!doc) return reply(req, 404, { error: "not_found" });
  if (doc.mime !== "application/pdf" && doc.size_bytes > IMAGE_LIMIT) return reply(req, 413, { error: "too_big" });

  const { data: usage, error: claimError } = await db.rpc("claim_document_read", {
    p_wedding: doc.wedding_id, p_document: doc.id, p_kind: mode === "contract" ? "contract_check" : "scan",
  });
  if (claimError) {
    const code = claimError.message.includes("ai_limit") ? "ai_limit" : claimError.message.includes("not_allowed") ? "not_allowed" : "server";
    return reply(req, code === "ai_limit" ? 429 : code === "not_allowed" ? 403 : 500, { error: code });
  }
  // Giving a read back is server-only, so nobody can refund their own successful scans.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const giveBack = () => admin.rpc("release_document_read", { p_usage: usage });

  try {
    const { data: file, error: fileError } = await db.storage.from("documents").download(doc.file_path);
    if (fileError || !file) { await giveBack(); return reply(req, 404, { error: "not_found" }); }
    const data = encodeBase64(new Uint8Array(await file.arrayBuffer()));
    const { data: wedding } = await db.from("weddings").select("destination, wedding_date").eq("id", doc.wedding_id).maybeSingle();

    const source = doc.mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: doc.mime, data } };
    const context = wedding ? `For context only (the document is the source of truth): the wedding is in ${wedding.destination} on ${wedding.wedding_date}.` : "";

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
    // deno-lint-ignore no-explicit-any
    const response: any = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if a safety classifier declines, Anthropic retries on its recommended model
      output_config: { effort: "medium", format: { type: "json_schema", schema: mode === "contract" ? CONTRACT_SCHEMA : SCAN_SCHEMA } },
      system: mode === "contract" ? CONTRACT_SYSTEM : SCAN_SYSTEM,
      messages: [{ role: "user", content: [source, { type: "text", text: `${context}\n\n${mode === "contract" ? CONTRACT_PROMPT : SCAN_PROMPT}`.trim() }] }],
    // deno-lint-ignore no-explicit-any
    } as any);

    if (response.stop_reason !== "end_turn") {
      await giveBack();
      return reply(req, 422, { error: response.stop_reason === "refusal" ? "declined" : "unreadable" });
    }
    const text = response.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { await giveBack(); return reply(req, 422, { error: "unreadable" }); }
    const result = mode === "contract" ? cleanContract(parsed as ContractResult) : cleanScan(parsed as ScanResult);
    if (!result.readable) await giveBack(); // an unreadable photo doesn't use up the allowance
    const { data: left } = await db.rpc("document_reads_left", { w: doc.wedding_id });
    return reply(req, 200, { mode, result, reads_left: left });
  } catch (e) {
    await giveBack();
    const status = e instanceof Anthropic.RateLimitError ? 503 : 502;
    console.error("read-document failed", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    return reply(req, status, { error: "busy" });
  }
});
