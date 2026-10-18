import { parseAmountToMinor, parsePercentToBp } from "./money.ts";
import { currency } from "./currencies.ts";
import { likelyTaxRate, taxOn } from "./tax.ts";
import {
  MUST_HAVE_KEYS, RECOMMENDED_KEYS, type ContractResult, type ScanResult,
} from "../../supabase/functions/_shared/reading.ts";

export type { ContractResult, ScanResult };
export { MUST_HAVE_KEYS, RECOMMENDED_KEYS };

// Turns what the AI read into drafts the couple checks and edits before anything is saved.

export const AI_NOTICE = "We read this automatically. Check every amount and date before you save.";

// Amounts come back as printed decimals ("7800.00"); trailing zeros beyond the currency's minor
// units are dropped (e.g. "655957.00" XOF), so they parse with the same string maths as typed amounts.
export function amountToMinor(amount: string, code: string): number | null {
  const cur = currency(code);
  if (!cur || !amount) return null;
  const [w, f = ""] = amount.split(".");
  const frac = f.replace(/0+$/, "");
  if (frac.length > cur.minor) return null;
  return parseAmountToMinor(frac ? `${w}.${frac}` : w, code);
}

export type Draft = {
  key: string;
  include: boolean;
  label: string;
  title: string;
  amount: string;           // as the couple will edit it, e.g. "7800" or "7800.50"
  status: "due" | "paid";
  due_on: string;           // "" when not known
  paid_on: string;
  doubtful: boolean;        // the amount couldn't be read; the couple must fill it in
};

export function minorToText(minor: number, code: string): string {
  const digits = currency(code)?.minor ?? 2;
  const s = String(minor).padStart(digits + 1, "0");
  const whole = digits ? s.slice(0, -digits) : s;
  const frac = digits ? s.slice(-digits).replace(/0+$/, "") : "";
  return frac ? `${whole}.${frac.padEnd(digits, "0")}` : whole;
}

export function draftsFrom(r: ScanResult, supplierName: string, today: string): Draft[] {
  const code = r.currency ?? "";
  return r.payments.map((p, i) => {
    const minor = code ? amountToMinor(p.amount, code) : null;
    const paid = p.status === "paid";
    return {
      key: `p${i}`,
      include: true,
      label: p.label,
      title: supplierName ? `${supplierName} – ${p.label}` : p.label.charAt(0).toUpperCase() + p.label.slice(1),
      amount: minor !== null ? minorToText(minor, code) : "",
      status: paid ? "paid" : "due",
      due_on: p.due_date ?? "",
      paid_on: paid ? p.paid_date ?? today : "",
      doubtful: minor === null,
    };
  });
}

export type TaxFields = { tax_included: boolean | null; tax_rate_bp: number | null };

export function taxFields(r: Pick<ScanResult, "tax">): TaxFields {
  const bp = r.tax.rate_percent ? parsePercentToBp(r.tax.rate_percent) : null;
  if (r.tax.status === "included") return { tax_included: true, tax_rate_bp: bp };
  if (r.tax.status === "not_included") return { tax_included: false, tax_rate_bp: bp };
  return { tax_included: null, tax_rate_bp: null };
}

// The tax missing from a quote without tax, on what the couple is adding, at the printed rate or the Kit's.
export function missingTax(r: ScanResult, drafts: Draft[], destination: string | null): { minor: number; rateBp: number } | null {
  if (r.tax.status !== "not_included" || !r.currency) return null;
  const rate = likelyTaxRate(r.category, destination, taxFields(r).tax_rate_bp);
  if (rate === null) return null;
  const base = drafts.filter((d) => d.include).reduce((a, d) => a + (parseAmountToMinor(d.amount, r.currency!) ?? 0), 0);
  return base ? { minor: taxOn(base, rate), rateBp: rate } : null;
}

// What a contract check saves: every clause with its state and evidence, and the red flags.
export function contractRow(r: ContractResult) {
  const clauses: Record<string, { state: string; evidence: string | null }> = {};
  for (const k of MUST_HAVE_KEYS) clauses[k] = r.must_haves[k];
  for (const k of RECOMMENDED_KEYS) clauses[k] = r.recommended[k];
  return { clauses, red_flags: r.red_flags };
}

export const RECOMMENDED_LABEL: Record<(typeof RECOMMENDED_KEYS)[number], string> = {
  who: "who you're dealing with", what: "exactly what you're getting", price_currency: "price, currency and charges",
  you_cancel: "if you cancel or postpone", force_majeure: "force majeure", third_parties: "third parties and planners",
  changes_language: "changes and language",
};

// Polite words for every way reading can fail.
export const READ_ERRORS: Record<string, string> = {
  ai_limit: "You've used the scans included so far. You can still add payments by hand.",
  not_allowed: "Only the couple and the planner can scan documents.",
  too_big: "That photo is too large to read. Try a smaller photo or a PDF.",
  declined: "We couldn't read this one automatically. Add the payments by hand instead.",
  unreadable: "We couldn't read this one clearly. Try a sharper photo, or add the payments by hand.",
  busy: "Reading documents is busy just now. Try again in a minute.",
  not_configured: "Scanning isn't switched on yet. Add the payments by hand for now.",
  not_found: "We couldn't find that document. Try uploading it again.",
  signed_out: "Sign in again, then try once more.",
  network: "We couldn't reach the server. Check your connection and try again.",
};
export const readError = (code: string | undefined) => READ_ERRORS[code ?? ""] ?? READ_ERRORS.busy;
