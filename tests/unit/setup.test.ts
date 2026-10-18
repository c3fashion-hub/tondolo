import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSetup, type SetupInput } from "../../src/lib/setup.ts";

const TODAY = "2026-10-18";
const base: SetupInput = { weddingDate: "2027-06-26", destination: "Porto, Portugal", homeCurrency: "GBP", names: "Ade & Sam", roughBudget: "58,000", useStarterBudget: true };

test("accepts a complete setup and stores the budget in pence", () => {
  const r = validateSetup(base, TODAY);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.draft.roughBudgetMinor, 5_800_000);
    assert.equal(r.draft.names, "Ade & Sam");
  }
});

test("names and budget are optional", () => {
  const r = validateSetup({ ...base, names: " ", roughBudget: "" }, TODAY);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.draft.names, null);
    assert.equal(r.draft.roughBudgetMinor, null);
  }
});

test("asks for the date, place and currency", () => {
  const r = validateSetup({ ...base, weddingDate: "", destination: "", homeCurrency: "" }, TODAY);
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["destination", "homeCurrency", "weddingDate"]);
});

test("rejects past and impossible dates", () => {
  const past = validateSetup({ ...base, weddingDate: "2026-10-17" }, TODAY);
  assert.equal(past.ok, false);
  const bad = validateSetup({ ...base, weddingDate: "2027-02-30" }, TODAY);
  assert.equal(bad.ok, false);
  const todayOk = validateSetup({ ...base, weddingDate: TODAY }, TODAY);
  assert.equal(todayOk.ok, true);
});

test("rejects a budget that isn't an amount", () => {
  const r = validateSetup({ ...base, roughBudget: "lots" }, TODAY);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.roughBudget);
});
