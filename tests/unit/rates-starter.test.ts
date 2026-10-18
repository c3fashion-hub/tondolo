import { test } from "node:test";
import assert from "node:assert/strict";
import { RateBook } from "../../src/lib/rates.ts";
import { buildStarter } from "../../src/lib/starter.ts";
import { divRound } from "../../src/lib/money.ts";
import { CATEGORIES } from "../../src/lib/categories.ts";

const book = new RateBook([
  { on_date: "2026-09-18", currency: "EUR", per_gbp: "1.25" },
  { on_date: "2026-10-18", currency: "EUR", per_gbp: "1.2" },
  { on_date: "2026-09-18", currency: "XOF", per_gbp: 780 },
]);

test("converts the same way the database does (same cases as supabase/tests/money_test.sql)", () => {
  assert.equal(book.convert(100000, "EUR", "GBP", "2026-09-18"), 80000);
  assert.equal(book.convert(100000, "EUR", "GBP", "2026-10-08"), 80000, "latest rate before the day");
  assert.equal(book.convert(100000, "EUR", "GBP", "2026-01-01"), 80000, "earliest rate if none before");
  assert.equal(book.convert(655957, "XOF", "EUR", "2026-09-18"), 105121);
  assert.equal(book.convert(1, "EUR", "GBP", "2026-10-18"), 1, "rounds half up");
  assert.equal(book.convert(100, "MAD", "GBP", "2026-10-18"), null, "no rate, no guess");
  assert.equal(book.convert(5000, "GBP", "GBP", "2026-10-18"), 5000);
  assert.equal(book.latestDate(), "2026-10-18");
});

test("divRound rounds half up without floating-point error", () => {
  assert.equal(divRound(5, 2), 3);
  assert.equal(divRound(4, 2), 2);
  assert.equal(divRound(115, 100), 1);
  assert.equal(divRound(150, 100), 2);
  assert.equal(divRound(9_007_199_254_740_991, 10), 900_719_925_474_099);
  assert.throws(() => divRound(1.5, 1));
});

test("the starter budget splits a rough total and plans payments from the date", () => {
  const { budgets, payments } = buildStarter(4_000_000, "GBP", "2027-06-26", "2026-10-18");
  const venue = budgets.find((b) => b.category === "Venue hire")!;
  assert.equal(venue.amount_minor, 720_000, "18% of £40,000");
  const total = budgets.reduce((a, b) => a + b.amount_minor, 0);
  assert.ok(Math.abs(total - 4_000_000) <= 30 * 1000, `split adds up to about the total (${total})`);
  const venuePayments = payments.filter((p) => p.category === "Venue hire");
  assert.deepEqual(venuePayments.map((p) => [p.title, p.amount_minor, p.due_on, p.due_offset_days]), [
    ["Venue hire – deposit", 216_000, "2026-11-01", null],
    ["Venue hire – second payment", 288_000, "2026-12-28", 180],
    ["Venue hire – final balance", 216_000, "2027-05-27", 30],
  ]);
  assert.ok(payments.every((p) => p.is_estimate && p.due_on >= "2026-10-25" && p.due_on <= "2027-06-26"));
  const hair = payments.filter((p) => p.category === "Hair and make-up").map((p) => p.due_on);
  assert.deepEqual(hair, ["2026-11-01", "2027-06-26"], "balance on the day");
});

test("a wedding soon moves past dates to a week from today", () => {
  const { payments } = buildStarter(1_000_000, "GBP", "2026-11-30", "2026-10-18");
  const venueSecond = payments.find((p) => p.title === "Venue hire – second payment")!;
  assert.equal(venueSecond.due_on, "2026-10-25");
});

test("no rough total: budget lines without amounts, and no estimates", () => {
  const { budgets, payments } = buildStarter(null, "GBP", "2027-06-26", "2026-10-18");
  assert.equal(budgets.length, CATEGORIES.length);
  assert.ok(budgets.every((b) => b.amount_minor === 0));
  assert.equal(payments.length, 0);
});

test("currencies without minor units round to 10 whole units", () => {
  const { budgets } = buildStarter(25_000_000, "XOF", "2027-06-26", "2026-10-18");
  assert.equal(budgets.find((b) => b.category === "Venue hire")!.amount_minor, 4_500_000);
  assert.ok(budgets.every((b) => b.amount_minor % 10 === 0));
});
