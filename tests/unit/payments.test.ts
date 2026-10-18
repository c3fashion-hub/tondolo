import { test } from "node:test";
import assert from "node:assert/strict";
import { RateBook } from "../../src/lib/rates.ts";
import { totals, budgetSummary, exposure, feesLost, contributions, statusOf, homeValue, type Payment } from "../../src/lib/payments.ts";
import { CATEGORIES } from "../../src/lib/categories.ts";
import { formatMinor } from "../../src/lib/money.ts";
import { PAYMENTS, RATES, TODAY, BUDGETS, MUM, TUNDE } from "../../src/lib/example/wedding.ts";

const book = new RateBook(RATES);

test("the example wedding's totals match the spec", () => {
  const t = totals(PAYMENTS, "GBP", book, TODAY);
  assert.equal(t.committed, 4_157_800, "£41,578 committed");
  assert.equal(t.paid, 937_100, "£9,371 paid");
  assert.equal(t.toPay, 3_220_700, "£32,207 still to pay");
  assert.equal(t.planned, 262_300, "£2,623 planned, not committed");
  assert.equal(t.waitingForRate, 0);
});

test("the budget screen's headline and groups", () => {
  const b = budgetSummary(PAYMENTS, BUDGETS, "GBP", book, TODAY, CATEGORIES);
  assert.equal(b.budget, 5_800_000, "£58,000 budget");
  assert.equal(b.committed, 4_157_800);
  assert.equal(b.planned, 262_300);
  const venue = b.groups.find((g) => g.name === "Venue")!;
  assert.equal(venue.budget, 2_400_000);
  assert.equal(venue.committed, 2_265_200, "£22,652 committed on the venue");
  const travel = b.groups.find((g) => g.name === "Supplier travel and hospitality")!;
  assert.equal(formatMinor(travel.committed, "GBP", { whole: true }), "£258");
  assert.equal(formatMinor(travel.planned, "GBP", { whole: true }), "£1,419");
});

test("currency exposure and the 5% swing", () => {
  const e = exposure(PAYMENTS, "GBP", book, TODAY);
  assert.equal(e.rows.length, 1);
  assert.equal(e.rows[0].owed, 3_745_000, "€37,450 still owed");
  assert.equal(e.rows[0].worth, 3_220_700, "worth £32,207 today");
  assert.equal(formatMinor(e.swing, "GBP", { whole: true }), "£1,610");
});

test("money lost to fees and rates", () => {
  assert.equal(feesLost(PAYMENTS, "GBP", book), 34_565);
  assert.equal(formatMinor(feesLost(PAYMENTS, "GBP", book), "GBP", { whole: true }), "£346");
});

test("contributions by who's paying, in the payer's currency too", () => {
  const c = contributions(PAYMENTS, [
    { id: null, name: "Ade & Sam", currency: null },
    { id: MUM, name: "Mum", currency: "GBP" },
    { id: TUNDE, name: "Uncle Tunde", currency: "NGN" },
  ], "GBP", book, TODAY);
  const by = Object.fromEntries(c.map((x) => [x.name, x]));
  assert.equal(by["Mum"].committed, 963_200, "Mum covers the caterer: £9,632");
  assert.equal(by["Uncle Tunde"].committed, 216_600, "Uncle Tunde covers the photographer: £2,166");
  assert.equal(by["Uncle Tunde"].inOwn, 433_200_000, "about ₦4,332,000");
  assert.equal(by["Ade & Sam"].committed, 4_157_800 - 963_200 - 216_600);
});

test("a paid amount keeps its locked value when rates change the next day", () => {
  const venueDeposit = PAYMENTS[1];
  const tomorrow = new RateBook([...RATES, { on_date: "2026-10-19", currency: "EUR", per_gbp: "1.0500000000" }]);
  assert.equal(homeValue(venueDeposit, "GBP", tomorrow, "2026-10-19"), 700_000, "still £7,000");
  const balance = PAYMENTS[6];
  assert.notEqual(homeValue(balance, "GBP", tomorrow, "2026-10-19"), homeValue(balance, "GBP", book, TODAY), "unpaid amounts follow today's rate");
});

test("if the home currency changes, a locked amount is re-expressed at the rate on the day paid", () => {
  const deposit = PAYMENTS[1]; // £7,000 locked on 15 June at 1 GBP = 1.1695906433 EUR
  assert.equal(homeValue(deposit, "EUR", book, TODAY), 818_713, "€8,187.13");
});

test("a paid amount waiting for its rate isn't counted as zero", () => {
  const waiting: Payment = { ...PAYMENTS[1], locked_home_minor: null };
  const t = totals([waiting], "GBP", book, TODAY);
  assert.equal(t.waitingForRate, 1);
  assert.equal(t.paid, 0);
});

test("status chips use words", () => {
  const due = (due_on: string | null): Payment => ({ ...PAYMENTS[4], due_on });
  assert.deepEqual(statusOf(due("2026-10-23"), TODAY), { label: "Due in 5 days", tone: "due" });
  assert.deepEqual(statusOf(due("2026-10-19"), TODAY), { label: "Due in 1 day", tone: "due" });
  assert.deepEqual(statusOf(due("2026-10-18"), TODAY), { label: "Due today", tone: "due" });
  assert.deepEqual(statusOf(due("2026-10-16"), TODAY), { label: "Overdue by 2 days", tone: "risk" });
  assert.deepEqual(statusOf(due(null), TODAY), { label: "Add a due date", tone: "neutral" });
  assert.equal(statusOf(due("2027-05-26"), TODAY), null, "nothing to flag months ahead");
  assert.deepEqual(statusOf(PAYMENTS[0], TODAY), { label: "Paid", tone: "paid" });
  assert.deepEqual(statusOf(PAYMENTS[14], TODAY), { label: "Estimate", tone: "estimate" });
});
