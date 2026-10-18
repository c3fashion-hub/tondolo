import { GROUPS, PLANS } from "./categories.ts";
import { currency } from "./currencies.ts";
import { divRound } from "./money.ts";

export type StarterBudget = { category: string; amount_minor: number };
export type StarterPayment = {
  title: string; category: string; amount_minor: number; currency: string;
  due_on: string; due_offset_days: number | null; is_estimate: true;
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

// Rounds minor units to the nearest 10 whole units of the currency (e.g. £10).
function roundToTen(minor: number, minorDigits: number): number {
  const step = 10 * 10 ** minorDigits;
  return divRound(minor, step) * step;
}

// The standard budget split of a rough total, and estimate payments planned from the wedding date.
// "At booking" is two weeks after setup; anything that would fall in the past moves to a week from
// today; nothing falls after the wedding.
export function buildStarter(totalMinor: number | null, home: string, weddingDate: string, today: string): { budgets: StarterBudget[]; payments: StarterPayment[] } {
  const minorDigits = currency(home)?.minor ?? 2;
  const budgets: StarterBudget[] = [];
  const payments: StarterPayment[] = [];
  for (const g of GROUPS) {
    for (const line of g.lines) {
      const amount = totalMinor ? roundToTen(divRound(totalMinor * Math.round(line.share * 10), 1000), minorDigits) : 0;
      budgets.push({ category: line.name, amount_minor: amount });
      if (!amount || !line.plan) continue;
      for (const part of PLANS[line.plan]) {
        let due = part.when === "book" ? addDays(today, 14) : addDays(weddingDate, -part.when);
        if (due < today) due = addDays(today, 7);
        if (due > weddingDate) due = weddingDate;
        payments.push({
          title: `${line.name}${part.label ? ` – ${part.label}` : ""}`,
          category: line.name,
          amount_minor: roundToTen(divRound(amount * part.share, 100), minorDigits),
          currency: home,
          due_on: due,
          due_offset_days: part.when === "book" ? null : part.when,
          is_estimate: true,
        });
      }
    }
  }
  return { budgets, payments };
}
