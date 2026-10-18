import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES } from "../../src/lib/categories.ts";
import { CATEGORY_NAMES, CONTRACT_SCHEMA, SCAN_SCHEMA, cleanContract, cleanScan, type ScanResult } from "../../supabase/functions/_shared/reading.ts";
import { amountToMinor, contractRow, draftsFrom, minorToText, missingTax, readError, taxFields } from "../../src/lib/reading.ts";

// What the AI should return for the Quinta's invoice in the example wedding (spec: "Scan review").
const quinta: ScanResult = {
  readable: true, problem: null, document_kind: "invoice", language: "Portuguese",
  supplier: { name: "Quinta do Rio", legal_name: "Quinta do Rio, Lda.", tax_number: "PT500000000", email: null, phone: null, country: "Portugal" },
  currency: "EUR", total: "26000.00",
  tax: { status: "not_included", rate_percent: "23", wording: "IVA não incluído" },
  category: "Venue hire",
  payments: [
    { label: "deposit 30%", amount: "7800.00", due_date: null, status: "paid", paid_date: "2026-06-15" },
    { label: "balance 70%", amount: "18200.00", due_date: "2027-05-26", status: "due", paid_date: null },
  ],
};

test("the reading module's budget lines match the app's", () => {
  assert.deepEqual(CATEGORY_NAMES, CATEGORIES);
});

test("the Quinta's invoice becomes two payments to check, with IVA flagged", () => {
  const drafts = draftsFrom(cleanScan(quinta), "Quinta do Rio", "2026-10-18");
  assert.deepEqual(drafts.map((d) => [d.title, d.amount, d.status, d.due_on, d.paid_on]), [
    ["Quinta do Rio – deposit 30%", "7800", "paid", "", "2026-06-15"],
    ["Quinta do Rio – balance 70%", "18200", "due", "2027-05-26", ""],
  ]);
  assert.deepEqual(taxFields(quinta), { tax_included: false, tax_rate_bp: 2300 });
  assert.deepEqual(missingTax(quinta, drafts, "Porto, Portugal"), { minor: 598_000, rateBp: 2300 }, "about €5,980");
  assert.equal(missingTax(quinta, drafts.map((d, i) => ({ ...d, include: i === 1 })), "Porto, Portugal")!.minor, 418_600, "only on what's being added");
});

test("amounts are read with string maths, never floating point", () => {
  assert.equal(amountToMinor("7800.00", "EUR"), 780_000);
  assert.equal(amountToMinor("0.10", "EUR"), 10);
  assert.equal(amountToMinor("655957.00", "XOF"), 655_957);
  assert.equal(amountToMinor("1.235", "TND"), 1_235);
  assert.equal(amountToMinor("12.345", "EUR"), null, "more decimals than the currency has");
  assert.equal(amountToMinor("", "EUR"), null);
  assert.equal(minorToText(780_050, "EUR"), "7800.50");
  assert.equal(minorToText(5, "EUR"), "0.05");
  assert.equal(minorToText(655_957, "XOF"), "655957");
});

test("doubtful values are cleared for the couple to fill in, not passed on", () => {
  const messy = cleanScan({
    ...quinta, currency: "eur", total: "26.000,00",
    tax: { status: "not_included", rate_percent: "23%", wording: null }, category: "Spaceship hire",
    payments: [
      { label: "  ", amount: "7.800,00", due_date: "2027-02-30", status: "unknown", paid_date: null },
      { label: "balance", amount: "18200", due_date: "2027-05-26", status: "due", paid_date: "yesterday" },
    ],
  });
  assert.equal(messy.currency, "EUR");
  assert.equal(messy.total, null);
  assert.equal(messy.tax.rate_percent, null);
  assert.equal(messy.category, null);
  assert.deepEqual(messy.payments[0], { label: "payment", amount: "", due_date: null, status: "unknown", paid_date: null });
  assert.equal(messy.payments[1].paid_date, null);
  const drafts = draftsFrom(messy, "", "2026-10-18");
  assert.equal(drafts[0].doubtful, true);
  assert.equal(drafts[0].status, "due", "unknown is treated as still to pay");
  assert.equal(drafts[0].title, "Payment");
});

test("a contract check saves every clause and the red flags", () => {
  const clause = (state: "present" | "incomplete" | "missing", evidence: string | null = null) => ({ state, evidence });
  const r = cleanContract({
    readable: true, problem: null, language: "Portuguese", supplier_name: "Quinta do Rio",
    must_haves: { payment_schedule: clause("present", "30% na reserva"), named_people: clause("incomplete", "A coordenadora Ana"), supplier_cancels: clause("missing") },
    recommended: { who: clause("present"), what: clause("present"), price_currency: clause("incomplete"), you_cancel: clause("present"), force_majeure: clause("missing"), third_parties: clause("missing"), changes_language: clause("missing") },
    red_flags: ["The deposit is non-refundable even if the venue cancels."], tax: { status: "not_included", rate_percent: "23", wording: "+ IVA" },
  });
  const row = contractRow(r);
  assert.equal(Object.keys(row.clauses).length, 10);
  assert.deepEqual(row.clauses.supplier_cancels, { state: "missing", evidence: null });
  assert.equal(row.red_flags.length, 1);
});

test("the schemas are strict: every field required, nothing extra", () => {
  const strict = (s: Record<string, unknown>): boolean => {
    if (s.type === "object") {
      const props = s.properties as Record<string, Record<string, unknown>>;
      return s.additionalProperties === false && JSON.stringify(s.required) === JSON.stringify(Object.keys(props)) && Object.values(props).every(strict);
    }
    if (s.type === "array") return strict(s.items as Record<string, unknown>);
    if (s.anyOf) return (s.anyOf as Record<string, unknown>[]).every(strict);
    return true;
  };
  assert.ok(strict(SCAN_SCHEMA));
  assert.ok(strict(CONTRACT_SCHEMA));
});

test("every failure has calm words", () => {
  assert.match(readError("ai_limit"), /add payments by hand/);
  assert.equal(readError("something new"), readError("busy"));
});
