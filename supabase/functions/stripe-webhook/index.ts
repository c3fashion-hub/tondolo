// Stripe tells us here when a checkout is paid (or expires). Each message is checked against
// Stripe's signature before anything happens; a paid checkout unlocks its wedding. While Tondolo is
// in test mode, live events are ignored.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { verifyStripeSignature } from "../_shared/billing.ts";

const ok = (note: string) => new Response(JSON.stringify({ received: true, note }), { status: 200, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const secret = raw.trim(); // a stray space or line break from copying shouldn't break it
  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get("Stripe-Signature"), secret))) {
    // Never the secret itself: only whether one is set and looks right, to help set-up.
    console.error("stripe-webhook: signature refused", JSON.stringify({
      secret_set: !!secret, looks_like_whsec: secret.startsWith("whsec_"), had_spaces: raw !== secret,
      header_present: !!req.headers.get("Stripe-Signature"),
    }));
    return new Response(JSON.stringify({ error: "bad_signature" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  // deno-lint-ignore no-explicit-any
  let event: any;
  try { event = JSON.parse(payload); } catch { return new Response("bad_request", { status: 400 }); }
  if (event.livemode) { console.error("stripe-webhook: ignoring a live event while in test mode", event.id); return ok("live_ignored"); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const s = event.data?.object ?? {};
  if ((event.type === "checkout.session.completed" && s.payment_status === "paid") || event.type === "checkout.session.async_payment_succeeded") {
    const { error } = await admin.rpc("complete_purchase", { p_session: s.id, p_amount: s.amount_total, p_currency: s.currency });
    if (error) {
      if (error.message.includes("unknown_session")) return ok("not_ours");
      console.error("stripe-webhook: couldn't complete", s.id, error.message);
      return new Response(JSON.stringify({ error: "server" }), { status: 500 }); // Stripe retries
    }
    return ok("unlocked");
  }
  if (event.type === "checkout.session.expired") {
    await admin.rpc("expire_purchase", { p_session: s.id });
    return ok("expired");
  }
  return ok("ignored");
});
