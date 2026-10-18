import type { RateBook } from "./rates.ts";
import { formatMinor } from "./money.ts";
import { formatShortDate, daysBetween } from "./dates.ts";
import { COMMONLY_FORGOTTEN } from "./categories.ts";
import { homeValue, totals, METHOD_LABEL, type Payment } from "./payments.ts";
import { likelyTaxRate, taxCountry, taxOn } from "./tax.ts";
import {
  MUST_HAVES, contractGaps, protectionFor, unassignedRisk,
  type BookingConfirmation, type ContractCheck, type Supplier, type SupplierProtection,
} from "./protection.ts";
import type { Tone } from "@/components/ui/StatusChip";

// The money health check, as approved on 18 October 2026 (spec: "Money health check score").
// Starts at 100 and loses points per issue, capped per issue type. Never says "protected" or "safe".

export type IssueGroup = "supplier" | "overdue" | "tax" | "forgotten" | "estimate";
export type Issue = {
  id: string;
  group: IssueGroup;
  points: number;
  chip: { label: string; tone: Tone };
  title: string;
  body: string;
  figure: number | null;     // this issue's own money figure in the home currency, counted once
  action: { label: string; href: string } | null; // relative to the wedding, e.g. "payments#s-…"
};

export type Health = {
  score: number;
  band: string;
  issues: Issue[];
  fixFirstTwo: number;       // the score with the first two issues fixed
  atRisk: number;
  paid: number;
  covered: number;
  suppliers: SupplierProtection[];
};

export type HealthInput = {
  payments: Payment[]; budgets: { category: string; amount_minor: number }[];
  suppliers: Supplier[]; checks: ContractCheck[]; bookings: BookingConfirmation[];
  home: string; weddingDate: string; destination: string | null; book: RateBook; today: string;
};

const LEVEL_POINTS = { 1: 8, 2: 4, 3: 1 } as const;
const CAPS = { risk: 20, protection: 20, overdue: 15, tax: 15, forgotten: 10, estimate: 6 } as const;
const ORDER: IssueGroup[] = ["supplier", "overdue", "tax", "forgotten", "estimate"];

export function band(score: number): string {
  return score >= 85 ? "In good shape" : score >= 65 ? "A few gaps to close" : "Money at risk";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Takes points from a shared cap in order, most points first.
function capped<T extends { raw: number }>(items: T[], limit: number): (T & { points: number })[] {
  let left = limit;
  return [...items].sort((a, b) => b.raw - a.raw).map((it) => {
    const points = Math.min(it.raw, left);
    left -= points;
    return { ...it, points };
  });
}

// Before any real payment there's no score.
export function healthCheck(input: HealthInput): Health | null {
  const { payments, budgets, home, weddingDate, destination, book, today } = input;
  const real = payments.filter((p) => !p.is_estimate);
  if (!real.length) return null;
  const money = (m: number) => formatMinor(m, home, { whole: true });
  const t = totals(payments, home, book, today);

  // Suppliers: money at risk and the protections their level needs form one issue each.
  const suppliers = input.suppliers
    .map((s) => protectionFor(s, payments, input.checks, input.bookings, weddingDate, home, book, today))
    .filter((s) => s.committed > 0);
  const loose = unassignedRisk(payments, home, book, today);
  const riskPoints = (m: number) => (t.committed > 0 ? Math.floor((m * 50) / t.committed) : 0); // 1 per 2% of committed

  type Raw = { s: SupplierProtection | null; risk: number; protection: number; raw: number };
  const raws: Raw[] = suppliers
    .filter((s) => s.atRisk > 0 || !s.inPlace)
    .map((s) => ({ s, risk: riskPoints(s.atRisk), protection: s.inPlace ? 0 : LEVEL_POINTS[s.level], raw: 0 }));
  if (loose.atRisk > 0) raws.push({ s: null, risk: riskPoints(loose.atRisk), protection: 0, raw: 0 });
  for (const r of raws) r.raw = r.risk + r.protection;
  let riskLeft: number = CAPS.risk, protLeft: number = CAPS.protection;
  const supplierIssues: Issue[] = raws.sort((a, b) => b.raw - a.raw).map((r) => {
    const risk = Math.min(r.risk, riskLeft); riskLeft -= risk;
    const prot = Math.min(r.protection, protLeft); protLeft -= prot;
    return r.s ? supplierIssue(r.s, risk + prot, money) : {
      id: "unassigned", group: "supplier", points: risk, chip: { label: "Money at risk", tone: "risk" },
      title: `Payments with no supplier: ${money(loose.atRisk)} at risk`,
      body: `${list(loose.payments.map((p) => p.title))}. Add the supplier and how you paid, so you can see what covers it.`,
      figure: loose.atRisk, action: { label: "See payments", href: "payments" },
    } satisfies Issue;
  });

  // Overdue: real payments still to pay after their due date.
  const overdue = capped(real.filter((p) => p.status !== "paid" && p.due_on && p.due_on < today)
    .map((p) => ({ p, raw: 5 })), CAPS.overdue).map(({ p, points }): Issue => {
    const days = -daysBetween(today, p.due_on!);
    return {
      id: `overdue-${p.id}`, group: "overdue", points, chip: { label: `Overdue by ${plural(days, "day")}`, tone: "risk" },
      title: `${p.title}: ${formatMinor(p.amount_minor, p.currency)} was due ${formatShortDate(p.due_on!)}`,
      body: "Pay it, or change the due date if the supplier agreed a new one.",
      figure: null, action: { label: "See payment", href: "payments" },
    };
  });

  // Hidden tax: quotes entered without tax, grouped by supplier.
  const taxName = taxCountry(destination) ? "IVA" : "tax";
  const byKey = new Map<string, Payment[]>();
  for (const p of real.filter((p) => p.tax_included === false)) {
    const key = p.supplier_id ?? `p-${p.id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  const tax = capped([...byKey].map(([key, ps]) => ({ key, ps, raw: 5 })), CAPS.tax).map(({ key, ps, points }): Issue => {
    const who = input.suppliers.find((s) => s.id === ps[0].supplier_id)?.name ?? ps[0].title;
    const rates = ps.map((p) => likelyTaxRate(p.category, destination, p.tax_rate_bp));
    const known = rates.every((r) => r !== null);
    const currency = ps[0].currency;
    const sameCurrency = ps.every((p) => p.currency === currency);
    if (!known || !sameCurrency) {
      return {
        id: `tax-${key}`, group: "tax", points, chip: { label: "Tax not shown", tone: "due" },
        title: `${who}: tax not shown`,
        body: `The price leaves out tax and the rate isn't known here. Ask ${who} for the total including tax, and the rate for each item.`,
        figure: null, action: { label: "See payments", href: "payments" },
      };
    }
    const base = ps.reduce((a, p) => a + p.amount_minor, 0);
    const missing = ps.reduce((a, p, i) => a + taxOn(p.amount_minor, rates[i]!), 0);
    const inHome = currency === home ? missing : book.convert(missing, currency, home, today);
    const oneRate = rates.every((r) => r === rates[0]) ? ` at ${rates[0]! / 100}%` : "";
    return {
      id: `tax-${key}`, group: "tax", points, chip: { label: "Hidden tax", tone: "due" },
      title: `About ${formatMinor(missing, currency, { whole: true })} of ${taxName} isn't in your totals`,
      body: `${who}'s price leaves out ${taxName}${oneRate}: ${formatMinor(missing, currency, { whole: true })} on ${formatMinor(base, currency, { whole: true })}`
        + `${inHome !== null && currency !== home ? `, about ${money(inHome)}` : ""}. Ask for the total including tax.`,
      figure: inHome, action: { label: "See payments", href: "payments" },
    };
  });

  // Commonly forgotten costs with no budget and no payment: one issue, 2 points each.
  const budgeted = new Set(budgets.filter((b) => b.amount_minor > 0).map((b) => b.category));
  const used = new Set(payments.map((p) => p.category));
  const gaps = COMMONLY_FORGOTTEN.filter((f) => !f.categories.some((c) => budgeted.has(c) || used.has(c)));
  const forgotten: Issue[] = gaps.length ? [{
    id: "forgotten", group: "forgotten", points: Math.min(gaps.length * 2, CAPS.forgotten), chip: { label: "Often forgotten", tone: "estimate" },
    title: `${plural(gaps.length, "cost")} missing from your budget`,
    body: `${cap(list(gaps.map((g) => g.label)))}. Add a budget for each, even a rough one.`,
    figure: null, action: { label: "Open budget", href: "budget" },
  }] : [];

  // Estimates due within 30 days with no real quote yet.
  const estimates = capped(payments.filter((p) => p.is_estimate && p.due_on && daysBetween(today, p.due_on) <= 30)
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!)).map((p) => ({ p, raw: 2 })), CAPS.estimate).map(({ p, points }): Issue => ({
    id: `estimate-${p.id}`, group: "estimate", points, chip: { label: "Estimate", tone: "estimate" },
    title: `${p.title} is still an estimate`,
    body: `Planned for ${formatShortDate(p.due_on!)}. Ask for a real quote this week.`,
    figure: null, action: { label: "Replace with a real quote", href: "payments" },
  }));

  const all = [...supplierIssues, ...overdue, ...tax, ...forgotten, ...estimates]
    .sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || b.points - a.points);
  const lost = all.reduce((a, i) => a + i.points, 0);
  const score = Math.max(0, 100 - lost);
  const fixFirstTwo = Math.min(100, score + all.slice(0, 2).reduce((a, i) => a + i.points, 0));
  if (all[0]) all[0].chip = { label: "Fix first", tone: all[0].chip.tone };
  if (all[1]) all[1].chip = { label: "Fix next", tone: all[1].chip.tone };
  const atRisk = suppliers.reduce((a, s) => a + s.atRisk, 0) + loose.atRisk;
  return { score, band: band(score), issues: all, fixFirstTwo, atRisk, paid: t.paid, covered: t.paid - atRisk, suppliers };
}

function supplierIssue(s: SupplierProtection, points: number, money: (m: number) => string): Issue {
  const name = s.supplier.name;
  const paidWords = s.atRisk > 0
    ? `You've paid ${list(s.paidInCurrency.map((c) => formatMinor(c.minor, c.currency, { whole: true })))}`
      + `${s.paidBy.filter(Boolean).length ? ` by ${list(s.paidBy.filter(Boolean).map((m) => METHOD_LABEL[m!].toLowerCase()))}` : ""}. `
    : "";
  const next = s.next ? ` (${formatMinor(s.next.amount_minor, s.next.currency, { whole: true })} due ${formatShortDate(s.next.due_on!)})` : "";
  let gap: string, advice: string, action: string;
  if (s.level === 1 && s.contract) {
    const named = (keys: readonly string[]) => keys.map((k) => MUST_HAVES.find((m) => m.key === k)!.label);
    const parts: string[] = [];
    if (s.contract.missing.length) parts.push(`${plural(s.contract.missing.length, "must-have")} missing (${list(named(s.contract.missing))})`);
    if (s.contract.incomplete.length) parts.push(`${s.contract.missing.length ? s.contract.incomplete.length : plural(s.contract.incomplete.length, "must-have")} incomplete (${list(named(s.contract.incomplete))})`);
    gap = `The Level 1 contract has ${parts.join(", ")}.`;
    advice = ` Ask ${name} to add ${s.contract.missing.length + s.contract.incomplete.length === 1 ? "it" : "them"} before your next payment${next}.`;
    action = "See what to ask for";
  } else if (s.level === 1) {
    gap = "Level 1 needs a contract with the three must-haves, and it hasn't been checked yet.";
    advice = ` Check it before your next payment${next}.`;
    action = "Check the contract";
  } else {
    gap = s.level === 2 ? "Level 2 needs a short contract or a booking message they confirm." : "Level 3 needs a booking message they reply \"Confirmed\" to.";
    advice = " Send them the six-point booking message and keep their reply.";
    action = "Confirm the booking";
  }
  const short = s.contract && (s.contract.missing.length || s.contract.incomplete.length) ? contractGaps(s.contract) : s.level === 1 ? "contract not checked" : "booking not confirmed";
  return {
    id: `supplier-${s.supplier.id}`, group: "supplier", points,
    chip: s.atRisk > 0 ? { label: "Money at risk", tone: "risk" } : { label: `Level ${s.level}`, tone: "due" },
    title: s.atRisk > 0 ? `${name}: ${money(s.atRisk)} at risk` : `${name}: ${short}`,
    body: paidWords + gap + advice,
    figure: s.atRisk > 0 ? s.atRisk : null,
    action: { label: action, href: `payments#s-${s.supplier.id}` },
  };
}
