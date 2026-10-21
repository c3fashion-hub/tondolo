// Starts a Stripe Checkout for one wedding, and confirms it when the buyer comes back. Only the
// wedding's owner can buy. The price is set here, never by the app. A live Stripe key is refused
// until Mags says go live. The key never leaves the server.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PRICE_CURRENCIES, STRIPE_VERSION, checkoutForm, keyKind, type PriceCurrency } from "../_shared/billing.ts";
import { allowedOrigin, cors, reply } from "../_shared/http.ts";

const APP = (Deno.env.get("APP_URL") ?? "https://tondolo.app").replace(/\/$/, "");
const ID = /^[0-9a-f-]{36}$/i;

async function stripe(path: string, key: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION, "Content-Type": "application/x-www-form-urlencoded", ...(init.headers ?? {}) },
  });
  return { ok: res.ok, status: res.status, body: await res.json() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "method" });
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const kind = keyKind(key);
  if (kind === "live") { console.error("checkout: a live Stripe key is set; refusing until Mags says go live"); return reply(req, 503, { error: "live_key_refused" }); }
  if (kind !== "test") return reply(req, 503, { error: "not_configured" });
  const auth = req.headers.get("Authorization");
  if (!auth) return reply(req, 401, { error: "signed_out" });

  let body: { action?: string; wedding_id?: string; currency?: string; session_id?: string };
  try { body = await req.json(); } catch { return reply(req, 400, { error: "bad_request" }); }
  if (!body.wedding_id || !ID.test(body.wedding_id)) return reply(req, 400, { error: "bad_request" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply(req, 401, { error: "signed_out" });
  const { data: role } = await db.rpc("member_role_in", { w: body.wedding_id });
  const { data: wedding } = await db.from("weddings").select("id, unlocked_at").eq("id", body.wedding_id).maybeSingle();
  if (!role || !wedding) return reply(req, 404, { error: "not_found" });

  if (body.action === "confirm") {
    // The buyer is back from Stripe: check the payment with Stripe itself, then unlock.
    if (!body.session_id || !/^cs_test_[A-Za-z0-9]+$/.test(body.session_id)) return reply(req, 400, { error: "bad_request" });
    const { data: purchase } = await admin.from("purchases").select("id, wedding_id, status").eq("stripe_session_id", body.session_id).maybeSingle();
    if (!purchase || purchase.wedding_id !== wedding.id) return reply(req, 404, { error: "not_found" });
    const s = await stripe(`checkout/sessions/${body.session_id}`, key!);
    if (!s.ok) return reply(req, 502, { error: "busy" });
    if (s.body.client_reference_id !== wedding.id) return reply(req, 404, { error: "not_found" });
    if (s.body.payment_status !== "paid") return reply(req, 200, { unlocked: !!wedding.unlocked_at, status: s.body.status ?? "open" });
    const { error } = await admin.rpc("complete_purchase", { p_session: body.session_id, p_amount: s.body.amount_total, p_currency: s.body.currency });
    if (error) { console.error("checkout confirm failed", error.message); return reply(req, 500, { error: "server" }); }
    return reply(req, 200, { unlocked: true });
  }

  // Starting a checkout: the owner only, once.
  if (role !== "owner") return reply(req, 403, { error: "not_owner" });
  if (wedding.unlocked_at) return reply(req, 409, { error: "already_unlocked" });
  const currency = String(body.currency ?? "").toUpperCase() as PriceCurrency;
  if (!PRICE_CURRENCIES.includes(currency)) return reply(req, 400, { error: "bad_request" });
  const origin = req.headers.get("Origin") ?? "";
  const returnBase = allowedOrigin(origin) ? origin : APP;

  const s = await stripe("checkout/sessions", key!, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: checkoutForm({ currency, weddingId: wedding.id, buyerId: user.id, email: user.email ?? null, returnBase }),
  });
  if (!s.ok) {
    console.error("checkout: Stripe refused", s.status, s.body?.error?.code, s.body?.error?.message);
    return reply(req, 502, { error: "busy" });
  }
  const { error } = await admin.from("purchases").insert({
    wedding_id: wedding.id, buyer: user.id, stripe_session_id: s.body.id, currency, amount_minor: s.body.amount_total, livemode: !!s.body.livemode,
  });
  if (error) { console.error("checkout: couldn't record the session", error.message); return reply(req, 500, { error: "server" }); }
  return reply(req, 200, { url: s.body.url });
});
