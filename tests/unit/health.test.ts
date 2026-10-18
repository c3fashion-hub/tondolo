import { test } from "node:test";
import assert from "node:assert/strict";
import { RateBook } from "../../src/lib/rates.ts";
import { healthCheck, band, type HealthInput } from "../../src/lib/health.ts";
import { levelOf, protectionFor, contractGaps, inPlaceSummary } from "../../src/lib/protection.ts";
import { likelyTaxRate, taxCountry } from "../../src/lib/tax.ts";
import type { Payment } from "../../src/lib/payments.ts";
import {
  PAYMENTS, RATES, TODAY, BUDGETS, SUPPLIERS, CONTRACT_CHECKS, BOOKINGS, DESTINATION, WEDDING_DATE,
} from "../../src/lib/example/wedding.ts";

const book = new RateBook(RATES);
const example: HealthInput = {
  payments: PAYMENTS, budgets: BUDGETS, suppliers: SUPPLIERS, checks: CONTRACT_CHECKS, bookings: BOOKINGS,
  home: "GBP", weddingDate: WEDDING_DATE, destination: DESTINATION, book, today: TODAY,
};
const supplier = (name: string) => {
  const s = SUPPLIERS.find((x) => x.name === name)!;
  return protectionFor(s, PAYMENTS, CONTRACT_CHECKS, BOOKINGS, WEDDING_DATE, "GBP", book, TODAY);
};

test("the example wedding scores 71, and 92 once the first two are fixed", () => {
  const h = healthCheck(example)!;
  assert.equal(h.score, 71);
  assert.equal(h.band, "A few gaps to close");
  assert.equal(h.fixFirstTwo, 92);
  assert.deepEqual(h.issues.map((i) => [i.id, i.points]), [
    ["supplier-s-quinta", 16],   // £7,000 at risk (8) + Level 1 contract not complete (8)
    ["tax-s-quinta", 5],
    ["forgotten", 6],
    ["estimate-p15", 2],
  ]);
});

test("the example's findings read as in the spec", () => {
  const [quinta, tax, forgotten, dj] = healthCheck(example)!.issues;
  assert.equal(quinta.title, "Quinta do Rio: £7,000 at risk");
  assert.equal(quinta.figure, 700_000);
  assert.match(quinta.body, /^You've paid €7,800 by bank transfer\. The Level 1 contract has 1 must-have missing \(refund if the supplier cancels\), 1 incomplete \(named people and substitutes\)\./);
  assert.match(quinta.body, /Ask Quinta do Rio to add them before your next payment \(€18,200 due Wed,? 26 May 2027\)\.$/);
  assert.equal(quinta.chip.label, "Fix first");
  assert.equal(tax.title, "About €5,980 of IVA isn't in your totals");
  assert.equal(tax.body, "Quinta do Rio's price leaves out IVA at 23%: €5,980 on €26,000, about £5,143. Ask for the total including tax.");
  assert.equal(forgotten.title, "3 costs missing from your budget");
  assert.equal(forgotten.body, "Supplier transfers, local and tourist tax and guest transport. Add a budget for each, even a rough one.");
  assert.equal(forgotten.figure, null);
  assert.equal(dj.title, "DJ and sound – deposit is still an estimate");
});

test("going well: £2,371 of £9,371 paid is covered, £7,000 at risk", () => {
  const h = healthCheck(example)!;
  assert.equal(h.paid, 937_100);
  assert.equal(h.atRisk, 700_000);
  assert.equal(h.covered, 237_100);
});

test("protection levels per supplier match the spec", () => {
  const levels = Object.fromEntries(SUPPLIERS.map((s) => [s.name, supplier(s.name).level]));
  assert.deepEqual(levels, { "Quinta do Rio": 1, "Sabores do Douro": 1, "Magali Events": 1, "Luz Studio": 2, "Rita Beauty": 3, "Fado Duo": 3 });
  assert.equal(supplier("Quinta do Rio").committed, 2_265_200);
  assert.equal(supplier("Luz Studio").committed, 216_600);
  assert.equal(supplier("Rita Beauty").committed, 95_200);
  assert.equal(supplier("Fado Duo").committed, 43_000);
  assert.equal(inPlaceSummary(supplier("Quinta do Rio")), "Contract: 1 must-have missing, 1 incomplete");
  assert.equal(inPlaceSummary(supplier("Sabores do Douro")), "Contract checked: all 3 must-haves");
  assert.equal(inPlaceSummary(supplier("Luz Studio")), "Booking confirmed in writing · Arrives 13:00");
  assert.equal(supplier("Rita Beauty").covered, 17_800, "a Level 3 booking confirmation covers a bank transfer");
});

test("a single early payment of £1,000 or more makes Level 1", () => {
  const p = (over: Partial<Payment>): Payment => ({ ...PAYMENTS[2], supplier_id: "x", paid_on: null, ...over });
  const early = [p({ amount_minor: 150_000, currency: "GBP", status: "due", due_on: "2027-01-10", locked_home_minor: null })];
  assert.equal(levelOf(early, WEDDING_DATE, "GBP", book, TODAY), 1, "£1,500 due over 90 days ahead");
  const late = [p({ amount_minor: 150_000, currency: "GBP", status: "due", due_on: "2027-06-01", locked_home_minor: null })];
  assert.equal(levelOf(late, WEDDING_DATE, "GBP", book, TODAY), 2, "£1,500 due a month ahead");
  const small = [p({ amount_minor: 99_999, currency: "GBP", status: "due", due_on: "2026-12-01", locked_home_minor: null })];
  assert.equal(levelOf(small, WEDDING_DATE, "GBP", book, TODAY), 3, "under £1,000");
});

test("money at risk counts paid money once and never money not yet paid", () => {
  // Quinta's balance (€18,200) is unpaid: not at risk, however weak the contract.
  assert.equal(supplier("Quinta do Rio").atRisk, 700_000);
  // A card payment with protected = yes is covered even with no contract checked.
  const magaliNoCheck = protectionFor(SUPPLIERS[2], PAYMENTS, [], BOOKINGS, WEDDING_DATE, "GBP", book, TODAY);
  assert.equal(magaliNoCheck.inPlace, false);
  assert.equal(magaliNoCheck.atRisk, 0);
  // Fixing the Quinta's contract covers its bank transfer too.
  const fixed = CONTRACT_CHECKS.map((c) => c.supplier_id === "s-quinta" ? { ...c, clauses: CONTRACT_CHECKS[1].clauses } : c);
  const h = healthCheck({ ...example, checks: fixed })!;
  assert.equal(h.atRisk, 0);
  assert.equal(h.score, 87, "71 + 16");
});

test("a Level 1 supplier is never told to send a booking message", () => {
  const h = healthCheck({ ...example, checks: [] })!;
  const sabores = h.issues.find((i) => i.id === "supplier-s-sabores")!;
  assert.equal(sabores.title, "Sabores do Douro: contract not checked");
  assert.doesNotMatch(sabores.body, /booking message/);
  assert.equal(sabores.points, 8);
});

test("caps per issue type, and the score never goes below zero", () => {
  const overdue: Payment[] = Array.from({ length: 6 }, (_, i) => ({ ...PAYMENTS[13], id: `o${i}`, supplier_id: null, due_on: "2026-10-01" }));
  const h = healthCheck({ ...example, payments: [...PAYMENTS, ...overdue] })!;
  assert.equal(h.issues.filter((i) => i.group === "overdue").reduce((a, i) => a + i.points, 0), 15);
  assert.equal(h.score, 71 - 15);
  assert.equal(band(84), "A few gaps to close");
  assert.equal(band(85), "In good shape");
  assert.equal(band(64), "Money at risk");
});

test("before any real payment there's no score", () => {
  assert.equal(healthCheck({ ...example, payments: PAYMENTS.filter((p) => p.is_estimate) }), null);
});

test("hidden tax uses the Kit's rates where known, else says tax not shown", () => {
  assert.equal(taxCountry("Porto, Portugal"), "PT");
  assert.equal(taxCountry("Funchal, Madeira, Portugal"), null);
  assert.equal(taxCountry("Marbella, Spain"), "ES");
  assert.equal(likelyTaxRate("Catering", "Porto, Portugal", null), 1300);
  assert.equal(likelyTaxRate("Catering", "Seville, Spain", null), 1000);
  assert.equal(likelyTaxRate("Venue hire", "Marrakech, Morocco", null), null);
  assert.equal(likelyTaxRate("Venue hire", "Marrakech, Morocco", 2000), 2000, "a rate the couple entered wins");
  const noRate = PAYMENTS.map((p) => p.supplier_id === "s-quinta" ? { ...p, tax_rate_bp: null } : p);
  const h = healthCheck({ ...example, payments: noRate, destination: "Marrakech, Morocco" })!;
  const tax = h.issues.find((i) => i.group === "tax")!;
  assert.equal(tax.title, "Quinta do Rio: tax not shown");
  assert.equal(tax.figure, null);
  assert.equal(tax.points, 5);
});

test("no wording promises money is safe or protected", () => {
  const texts = healthCheck({ ...example, checks: [], bookings: [] })!.issues.flatMap((i) => [i.title, i.body, i.chip.label]);
  for (const t of texts) assert.doesNotMatch(t, /\b(safe|protected)\b/i, t);
  assert.equal(contractGaps({ missing: [], incomplete: ["named_people"] }), "1 must-have incomplete");
});
