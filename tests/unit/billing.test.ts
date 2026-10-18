import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  PRICES, STRIPE_VERSION, checkoutForm, currencyFor, keyKind, verifyStripeSignature,
} from "../../supabase/functions/_shared/billing.ts";
import { priceText, TEST_MODE } from "../../src/lib/billing.ts";

test("one price, tax included: £49, $59 and €55", () => {
  assert.deepEqual(PRICES, { GBP: 4900, USD: 5900, EUR: 5500 });
  assert.deepEqual(["GBP", "USD", "EUR"].map((c) => priceText(c as "GBP")), ["£49", "US$59", "€55"]);
});

test("couples pay in euros or dollars when that's their home currency, pounds otherwise", () => {
  assert.equal(currencyFor("EUR"), "EUR");
  assert.equal(currencyFor("USD"), "USD");
  assert.equal(currencyFor("GBP"), "GBP");
  assert.equal(currencyFor("NGN"), "GBP");
});

test("Stripe stays in test mode: live keys are recognised so the server can refuse them", () => {
  assert.equal(TEST_MODE, true);
  assert.equal(keyKind("sk_test_abc"), "test");
  assert.equal(keyKind("rk_test_abc"), "test");
  assert.equal(keyKind("sk_live_abc"), "live");
  assert.equal(keyKind("rk_live_abc"), "live");
  assert.equal(keyKind(""), "missing");
  assert.equal(keyKind("pk_test_abc"), "unknown");
});

test("the checkout asks Stripe to be merchant of record, with the price including tax", () => {
  const f = checkoutForm({ currency: "EUR", weddingId: "w-1", buyerId: "u-1", email: "ade@example.com", returnBase: "https://tondolo.app" });
  assert.equal(f.get("mode"), "payment");
  assert.equal(f.get("managed_payments[enabled]"), "true");
  assert.equal(f.get("line_items[0][price_data][currency]"), "eur");
  assert.equal(f.get("line_items[0][price_data][unit_amount]"), "5500");
  assert.equal(f.get("line_items[0][price_data][tax_behavior]"), "inclusive");
  assert.match(f.get("line_items[0][price_data][product_data][tax_code]")!, /^txcd_/);
  assert.equal(f.get("client_reference_id"), "w-1");
  assert.equal(f.get("customer_email"), "ade@example.com");
  assert.equal(f.get("success_url"), "https://tondolo.app/w/w-1/unlock?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(f.get("cancel_url"), "https://tondolo.app/w/w-1/unlock?cancelled=1");
  assert.equal(checkoutForm({ currency: "GBP", weddingId: "w", buyerId: "u", email: null, returnBase: "x" }).has("customer_email"), false);
  assert.match(STRIPE_VERSION, /^\d{4}-\d{2}-\d{2}\./);
});

test("webhooks are accepted only with Stripe's signature, and only while fresh", async () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_792_000_000;
  const sign = (t: number, body = payload, key = secret) => createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
  assert.equal(await verifyStripeSignature(payload, `t=${now},v1=${sign(now)}`, secret, now), true);
  assert.equal(await verifyStripeSignature(payload, `t=${now},v1=deadbeef,v1=${sign(now)}`, secret, now), true, "any listed v1 may match");
  assert.equal(await verifyStripeSignature(payload, `t=${now},v1=${sign(now, payload, "whsec_other")}`, secret, now), false, "wrong secret");
  assert.equal(await verifyStripeSignature(payload + " ", `t=${now},v1=${sign(now)}`, secret, now), false, "changed body");
  assert.equal(await verifyStripeSignature(payload, `t=${now - 301},v1=${sign(now - 301)}`, secret, now), false, "too old");
  assert.equal(await verifyStripeSignature(payload, null, secret, now), false, "unsigned");
  assert.equal(await verifyStripeSignature(payload, `t=${now},v1=${sign(now)}`, "", now), false, "no secret set");
});
