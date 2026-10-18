import type { RateBook } from "./rates.ts";
import { divRound } from "./money.ts";
import { groupOf } from "./categories.ts";
import { daysBetween } from "./dates.ts";
import type { Tone } from "@/components/ui/StatusChip";

export type Method = "credit_card" | "debit_card" | "bank_transfer" | "cash" | "paypal" | "other";
export const METHOD_LABEL: Record<Method, string> = {
  credit_card: "Credit card", debit_card: "Debit card", bank_transfer: "Bank transfer", cash: "Cash", paypal: "PayPal", other: "Other",
};

export type Payment = {
  id: string; title: string; amount_minor: number; currency: string; status: "due" | "paid";
  due_on: string | null; paid_on: string | null; is_estimate: boolean; paying_member_id: string | null;
  supplier_id: string | null; category: string | null; method: Method | null; protected: "yes" | "no" | "not_sure";
  tax_included: boolean | null; tax_rate_bp: number | null; fees_minor: number | null; statement_minor: number | null;
  locked_home_minor: number | null; locked_home_currency: string | null; notes: string | null; due_offset_days: number | null;
  handover_time?: string | null; handover_note?: string | null; handover_by?: string | null;
};

export const PAYMENT_COLUMNS =
  "id, title, amount_minor, currency, status, due_on, paid_on, is_estimate, paying_member_id, supplier_id, category, method, protected, tax_included, tax_rate_bp, fees_minor, statement_minor, locked_home_minor, locked_home_currency, notes, due_offset_days, handover_time, handover_note, handover_by";

// What a payment is worth in the home currency: locked if paid, today's rate if not. Null while a rate is missing.
export function homeValue(p: Payment, home: string, book: RateBook, today: string): number | null {
  if (p.status === "paid") {
    if (p.locked_home_minor === null || !p.locked_home_currency) return null;
    if (p.locked_home_currency === home) return p.locked_home_minor;
    // The home currency changed after paying: re-express the locked amount at the rate on the day paid.
    return book.convert(p.locked_home_minor, p.locked_home_currency, home, p.paid_on ?? today);
  }
  return book.convert(p.amount_minor, p.currency, home, today);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// The status chip on a row. Always words, never colour alone.
export function statusOf(p: Payment, today: string): { label: string; tone: Tone } | null {
  if (p.is_estimate) return { label: "Estimate", tone: "estimate" };
  if (p.status === "paid") return { label: "Paid", tone: "paid" };
  if (!p.due_on) return { label: "Add a due date", tone: "neutral" };
  const d = daysBetween(today, p.due_on);
  if (d < 0) return { label: `Overdue by ${plural(-d, "day")}`, tone: "risk" };
  if (d === 0) return { label: "Due today", tone: "due" };
  if (d <= 30) return { label: `Due in ${plural(d, "day")}`, tone: "due" };
  return null;
}

export type Totals = { committed: number; paid: number; toPay: number; planned: number; waitingForRate: number };

// Committed = paid + still to pay. Estimates are planned, never committed.
export function totals(payments: Payment[], home: string, book: RateBook, today: string): Totals {
  const t: Totals = { committed: 0, paid: 0, toPay: 0, planned: 0, waitingForRate: 0 };
  for (const p of payments) {
    const v = homeValue(p, home, book, today);
    if (v === null) { t.waitingForRate++; continue; }
    if (p.is_estimate) t.planned += v;
    else if (p.status === "paid") t.paid += v;
    else t.toPay += v;
  }
  t.committed = t.paid + t.toPay;
  return t;
}

export type BudgetLine = { category: string; group: string; budget: number; committed: number; planned: number };
export type BudgetGroup = { name: string; budget: number; committed: number; planned: number; lines: BudgetLine[] };

export function budgetSummary(payments: Payment[], budgets: { category: string; amount_minor: number }[], home: string, book: RateBook, today: string, order: string[]) {
  const lines = new Map<string, BudgetLine>();
  const line = (category: string) => {
    let l = lines.get(category);
    if (!l) { l = { category, group: groupOf(category), budget: 0, committed: 0, planned: 0 }; lines.set(category, l); }
    return l;
  };
  for (const b of budgets) line(b.category).budget += b.amount_minor;
  for (const p of payments) {
    const v = homeValue(p, home, book, today);
    if (v === null) continue;
    const l = line(p.category ?? "Other");
    if (p.is_estimate) l.planned += v; else l.committed += v;
  }
  const rank = (c: string) => { const i = order.indexOf(c); return i < 0 ? order.length : i; };
  const groups = new Map<string, BudgetGroup>();
  for (const l of [...lines.values()].sort((a, b) => rank(a.category) - rank(b.category))) {
    if (!l.budget && !l.committed && !l.planned) continue;
    let g = groups.get(l.group);
    if (!g) { g = { name: l.group, budget: 0, committed: 0, planned: 0, lines: [] }; groups.set(l.group, g); }
    g.budget += l.budget; g.committed += l.committed; g.planned += l.planned; g.lines.push(l);
  }
  const all = [...groups.values()];
  return {
    groups: all,
    budget: all.reduce((a, g) => a + g.budget, 0),
    committed: all.reduce((a, g) => a + g.committed, 0),
    planned: all.reduce((a, g) => a + g.planned, 0),
  };
}

// What's still owed in other currencies, worth today, and what a 5% move against you would add.
export function exposure(payments: Payment[], home: string, book: RateBook, today: string) {
  const byCurrency = new Map<string, { currency: string; owed: number; worth: number; swing: number }>();
  for (const p of payments) {
    if (p.is_estimate || p.status === "paid" || p.currency === home) continue;
    const worth = book.convert(p.amount_minor, p.currency, home, today);
    if (worth === null) continue;
    const row = byCurrency.get(p.currency) ?? { currency: p.currency, owed: 0, worth: 0, swing: 0 };
    row.owed += p.amount_minor; row.worth += worth;
    byCurrency.set(p.currency, row);
  }
  const rows = [...byCurrency.values()].map((r) => ({ ...r, swing: divRound(r.worth * 5, 100) }));
  return { rows, swing: rows.reduce((a, r) => a + r.swing, 0) };
}

// For each paid payment: the statement amount against the mid-market rate on the day paid, plus fees entered.
// A better-than-mid-market rate counts as nothing lost, not as a gain.
export function feesLost(payments: Payment[], home: string, book: RateBook) {
  let total = 0;
  for (const p of payments) {
    if (p.status !== "paid" || !p.locked_home_currency || !p.paid_on) continue;
    let lost = p.fees_minor ?? 0;
    if (p.statement_minor !== null && p.currency !== p.locked_home_currency) {
      const mid = book.convert(p.amount_minor, p.currency, p.locked_home_currency, p.paid_on);
      if (mid !== null) lost += Math.max(0, p.statement_minor - mid);
    }
    if (!lost) continue;
    const inHome = p.locked_home_currency === home ? lost : book.convert(lost, p.locked_home_currency, home, p.paid_on);
    total += inHome ?? 0;
  }
  return total;
}

export type Payer = { id: string | null; name: string; currency: string | null };

// Totals by who's paying, in the home currency and, for family, in their own currency too.
export function contributions(payments: Payment[], payers: Payer[], home: string, book: RateBook, today: string) {
  return payers.map((payer) => {
    let committed = 0;
    for (const p of payments) {
      if (p.is_estimate || (p.paying_member_id ?? null) !== payer.id) continue;
      committed += homeValue(p, home, book, today) ?? 0;
    }
    const inOwn = payer.currency && payer.currency !== home ? book.convert(committed, home, payer.currency, today) : null;
    return { ...payer, committed, inOwn };
  }).filter((c) => c.committed > 0);
}
