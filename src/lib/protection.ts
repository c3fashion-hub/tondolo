import type { RateBook } from "./rates.ts";
import { homeValue, type Payment } from "./payments.ts";
import { daysBetween } from "./dates.ts";

// The Protection Kit's three must-haves, in its order.
export const MUST_HAVES = [
  { key: "payment_schedule", label: "payment schedule with receipts" },
  { key: "named_people", label: "named people and substitutes" },
  { key: "supplier_cancels", label: "refund if the supplier cancels" },
] as const;
export type MustHave = (typeof MUST_HAVES)[number]["key"];
export type ClauseState = "present" | "incomplete" | "missing";

export type ContractCheck = { supplier_id: string; clauses: Partial<Record<MustHave, { state: ClauseState; evidence?: string | null }>>; checked_at: string };
export type BookingConfirmation = {
  supplier_id: string; arrive_at: string | null; confirmed_on: string | null;
  id?: string; points?: Record<string, string>; language?: Language; sent_on?: string | null; reply_evidence?: string | null; created_at?: string;
};
export type Supplier = {
  id: string; name: string;
  legal_name?: string | null; contact_name?: string | null; phone?: string | null; email?: string | null; language?: Language;
};
export type Language = "en" | "fr" | "pt" | "es";
export type Level = 1 | 2 | 3;

export type SupplierProtection = {
  supplier: Supplier;
  level: Level;
  committed: number;      // home currency, real payments only
  paid: number;
  covered: number;        // paid and covered by a protected method or the level's protections
  atRisk: number;         // paid and not covered
  contract: { missing: MustHave[]; incomplete: MustHave[] } | null; // latest check, or null if none
  confirmed: boolean;
  arriveAt: string | null;
  inPlace: boolean;       // the protections this supplier's level needs
  paidBy: Payment["method"][];
  paidInCurrency: { currency: string; minor: number }[];
  next: Payment | null;   // next payment still to pay
};

// Level 1: about £3,000 or more in total, or one payment of about £1,000 or more made over three months
// ahead. Level 3: under about £1,000 in total. Level 2: in between. Thresholds are in pounds, converted
// to the home currency at today's rate.
export function levelOf(payments: Payment[], weddingDate: string, home: string, book: RateBook, today: string): Level {
  const big = book.convert(300_000, "GBP", home, today) ?? 300_000;
  const one = book.convert(100_000, "GBP", home, today) ?? 100_000;
  let total = 0;
  let earlyBig = false;
  for (const p of payments) {
    const v = homeValue(p, home, book, today) ?? 0;
    total += v;
    const when = p.paid_on ?? p.due_on;
    if (v >= one && when && daysBetween(when, weddingDate) > 90) earlyBig = true;
  }
  if (total >= big || earlyBig) return 1;
  return total < one ? 3 : 2;
}

// Contract with every must-have present.
const complete = (c: SupplierProtection["contract"]) => !!c && c.missing.length === 0 && c.incomplete.length === 0;

export function protectionFor(
  supplier: Supplier, all: Payment[], checks: ContractCheck[], bookings: BookingConfirmation[],
  weddingDate: string, home: string, book: RateBook, today: string,
): SupplierProtection {
  const payments = all.filter((p) => p.supplier_id === supplier.id && !p.is_estimate);
  const level = levelOf(payments, weddingDate, home, book, today);
  const latest = checks.filter((c) => c.supplier_id === supplier.id).sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0];
  const contract = latest ? {
    missing: MUST_HAVES.filter((m) => (latest.clauses[m.key]?.state ?? "missing") === "missing").map((m) => m.key),
    incomplete: MUST_HAVES.filter((m) => latest.clauses[m.key]?.state === "incomplete").map((m) => m.key),
  } : null;
  const booking = bookings.find((b) => b.supplier_id === supplier.id && b.confirmed_on);
  const confirmed = !!booking;
  const inPlace = level === 1 ? complete(contract) : complete(contract) || confirmed;

  let committed = 0, paid = 0, covered = 0;
  const paidBy = new Set<Payment["method"]>();
  const inCurrency = new Map<string, number>();
  for (const p of payments) {
    const v = homeValue(p, home, book, today) ?? 0;
    committed += v;
    if (p.status !== "paid") continue;
    paid += v;
    if (p.protected === "yes" || inPlace) covered += v;
    paidBy.add(p.method);
    inCurrency.set(p.currency, (inCurrency.get(p.currency) ?? 0) + p.amount_minor);
  }
  const next = payments.filter((p) => p.status !== "paid" && p.due_on).sort((a, b) => a.due_on!.localeCompare(b.due_on!))[0] ?? null;
  return {
    supplier, level, committed, paid, covered, atRisk: paid - covered, contract, confirmed,
    arriveAt: booking?.arrive_at ?? null, inPlace, paidBy: [...paidBy],
    paidInCurrency: [...inCurrency].map(([currency, minor]) => ({ currency, minor })), next,
  };
}

// Paid payments with no supplier: covered only by a protected payment method.
export function unassignedRisk(payments: Payment[], home: string, book: RateBook, today: string) {
  const rows = payments.filter((p) => !p.supplier_id && !p.is_estimate && p.status === "paid");
  let paid = 0, atRisk = 0;
  for (const p of rows) {
    const v = homeValue(p, home, book, today) ?? 0;
    paid += v;
    if (p.protected !== "yes") atRisk += v;
  }
  return { paid, atRisk, payments: rows.filter((p) => p.protected !== "yes") };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// "1 must-have missing, 1 incomplete", the same wording everywhere.
export function contractGaps(c: NonNullable<SupplierProtection["contract"]>): string {
  const parts: string[] = [];
  if (c.missing.length) parts.push(`${plural(c.missing.length, "must-have")} missing`);
  if (c.incomplete.length) parts.push(c.missing.length ? `${c.incomplete.length} incomplete` : `${plural(c.incomplete.length, "must-have")} incomplete`);
  return parts.join(", ");
}

// What a supplier has in place, in a few words, for rows and the health check.
export function inPlaceSummary(s: SupplierProtection): string {
  const bits: string[] = [];
  if (s.contract) bits.push(s.contract.missing.length || s.contract.incomplete.length ? `Contract: ${contractGaps(s.contract)}` : "Contract checked: all 3 must-haves");
  if (s.confirmed) bits.push("Booking confirmed in writing");
  if (s.arriveAt) bits.push(`Arrives ${s.arriveAt}`);
  if (!bits.length) bits.push(s.level === 1 ? "No contract checked yet" : "No booking confirmed yet");
  return bits.join(" · ");
}
