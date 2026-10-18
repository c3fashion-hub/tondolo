import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmountToMinor, formatMinor } from "../../src/lib/money.ts";

test("parses typed amounts into whole pence", () => {
  assert.equal(parseAmountToMinor("40,000", "GBP"), 4_000_000);
  assert.equal(parseAmountToMinor("£1,250.50", "GBP"), 125_050);
  assert.equal(parseAmountToMinor("1 200", "EUR"), 120_000);
  assert.equal(parseAmountToMinor("0.1", "GBP"), 10);
  assert.equal(parseAmountToMinor("007", "GBP"), 700);
});

test("respects currencies without minor units and with three", () => {
  assert.equal(parseAmountToMinor("850000", "XOF"), 850_000);
  assert.equal(parseAmountToMinor("12.5", "XOF"), null);
  assert.equal(parseAmountToMinor("1.234", "TND"), 1234);
});

test("never uses floating-point rounding", () => {
  // 0.1 + 0.2 style traps: 1.15 * 100 = 114.99999999999999 in floats
  assert.equal(parseAmountToMinor("1.15", "GBP"), 115);
  assert.equal(parseAmountToMinor("4.35", "GBP"), 435);
});

test("rejects things that aren't amounts", () => {
  for (const bad of ["", "abc", "1.234", "1..2", "-5", "1e5", "12,34.5.6"]) {
    assert.equal(parseAmountToMinor(bad, "GBP"), null, bad);
  }
  assert.equal(parseAmountToMinor("10", "ZZZ"), null);
});

test("formats minor units for display", () => {
  assert.equal(formatMinor(4_000_000, "GBP"), "£40,000");
  assert.equal(formatMinor(125_050, "GBP"), "£1,250.50");
  assert.equal(formatMinor(336_000, "EUR"), "€3,360");
  assert.equal(formatMinor(850_000, "XOF"), "F CFA 850,000".replace(/.*?(850,000)/, (m) => m) );
});

import { parsePercentToBp, minorToInput } from "../../src/lib/money.ts";
import { supplierNameFrom } from "../../src/lib/suppliers.ts";

test("reads tax rates as basis points", () => {
  assert.equal(parsePercentToBp("23"), 2300);
  assert.equal(parsePercentToBp("23.5%"), 2350);
  assert.equal(parsePercentToBp("0"), 0);
  assert.equal(parsePercentToBp("101"), null);
  assert.equal(parsePercentToBp("abc"), null);
});

test("turns stored amounts back into what you'd type", () => {
  assert.equal(minorToInput(125_050, "GBP"), "1,250.50");
  assert.equal(minorToInput(336_000, "EUR"), "3,360.00");
  assert.equal(minorToInput(850_000, "XOF"), "850,000");
});

test("finds the supplier in a payment title", () => {
  assert.equal(supplierNameFrom("Quinta do Rio – deposit 30%"), "Quinta do Rio");
  assert.equal(supplierNameFrom("Florist - balance"), "Florist");
  assert.equal(supplierNameFrom("Supplier food allowance"), "Supplier food allowance");
});
