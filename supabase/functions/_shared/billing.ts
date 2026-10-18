// Buying Tondolo: the prices (tax included), what Stripe Checkout is asked for, and checking that a
// webhook really came from Stripe. Plain TypeScript with no imports (Deno and Node); the Web Crypto
// API is built into both.

// One price, including tax, in three currencies (Mags, 18 October 2026). Minor units.
export const PRICES = { GBP: 4900, USD: 5900, EUR: 5500 } as const;
export type PriceCurrency = keyof typeof PRICES;
export const PRICE_CURRENCIES = Object.keys(PRICES) as PriceCurrency[];

export const PRODUCT_NAME = "Tondolo, with the Protection Kit";
export const PRODUCT_DESCRIPTION = "For up to 5 people, until 12 months after your wedding.";
// Stripe's code for electronically supplied services; Managed Payments needs one on every product.
export const TAX_CODE = "txcd_10000000";
// Pinned so Stripe's answers keep the same shape (Managed Payments needs this version or later).
export const STRIPE_VERSION = "2026-04-22.dahlia";

// Euros and dollars for couples whose home currency is one of them; pounds for everyone else.
export function currencyFor(home: string): PriceCurrency {
  return home === "EUR" || home === "USD" ? home : "GBP";
}

// Stripe stays in test mode until Mags says go live: a live key is refused, not used.
export type KeyKind = "test" | "live" | "missing" | "unknown";
export function keyKind(key: string | undefined | null): KeyKind {
  if (!key) return "missing";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return "unknown";
}

export type CheckoutInput = {
  currency: PriceCurrency; weddingId: string; buyerId: string; email: string | null; returnBase: string;
};

// The Checkout Session request, form-encoded as Stripe expects. Stripe is the merchant of record
// (Managed Payments): it works out and collects VAT and sales tax, inside the price.
export function checkoutForm(c: CheckoutInput): URLSearchParams {
  const f = new URLSearchParams({
    mode: "payment",
    "managed_payments[enabled]": "true",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": c.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(PRICES[c.currency]),
    "line_items[0][price_data][tax_behavior]": "inclusive",
    "line_items[0][price_data][product_data][name]": PRODUCT_NAME,
    "line_items[0][price_data][product_data][description]": PRODUCT_DESCRIPTION,
    "line_items[0][price_data][product_data][tax_code]": TAX_CODE,
    client_reference_id: c.weddingId,
    "metadata[wedding_id]": c.weddingId,
    "metadata[buyer]": c.buyerId,
    success_url: `${c.returnBase}/w/${c.weddingId}/unlock?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.returnBase}/w/${c.weddingId}/unlock?cancelled=1`,
  });
  if (c.email) f.set("customer_email", c.email);
  return f;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Stripe signs each webhook: "t=<time>,v1=<HMAC-SHA256 of 't.payload'>". Refuses anything unsigned,
// wrongly signed or more than five minutes old.
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || !sigs.length || Math.abs(nowSeconds - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some((s) => sameText(s, expected));
}
