import { currency } from "./currencies.ts";
import { daysBetween } from "./dates.ts";
import { healthCheck, type HealthInput } from "./health.ts";
import type { Payment } from "./payments.ts";
import type { SupplierProtection } from "./protection.ts";

// The weekly briefing: a short spoken update on what needs the couple this week, read aloud by the
// phone's own voice and shown on screen. Worked out from the wedding's own data, not by AI, so it
// says exactly what the app shows. Never says money is safe or protected.

export type Reminder = { id: string; text: string; due_on: string; done: boolean };

export type BriefingInput = HealthInput & {
  name: string;
  meId: string | null;
  people: { id: string; name: string }[];
  reminders: Reminder[];
};

export type Briefing = { hello: string; heading: string; items: string[]; sentences: string[] };

const WINDOW = 7;   // this week: today and the six days after
const ESTIMATE_DAYS = 30;
const MAX_ITEMS = 6;
const COUNT = ["Nothing", "One thing", "Two things", "Three things", "Four things", "Five things", "Six things"];

// Money as it's said aloud: "3,360 euros", "1,250.50 pounds". Exact decimal strings, never floats.
export function spokenMoney(minor: number, code: string): string {
  const digits = currency(code)?.minor ?? 2;
  const scale = 10 ** digits;
  const abs = Math.abs(minor);
  const frac = abs % scale;
  const exact = `${Math.floor(abs / scale)}${frac ? `.${String(frac).padStart(digits, "0")}` : ""}`;
  const text = new Intl.NumberFormat("en-GB", {
    style: "currency", currency: code, currencyDisplay: "name",
    minimumFractionDigits: frac ? digits : 0, maximumFractionDigits: frac ? digits : 0,
  }).format(exact as unknown as number);
  return text.replace(/British pounds?/, (m) => (m.endsWith("s") ? "pounds" : "pound"));
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const PERSON = /(er|or|ist|ian|grapher)$/i;

// "Caterer – deposit 30%" → "the caterer's deposit"; "Venue hire – balance 70%" → "the venue hire
// balance"; "Supplier flights" → "the supplier flights". `own` gives "your" instead of "the".
export function spokenTitle(title: string, own = false): string {
  const clean = title.replace(/\s*\d+(\.\d+)?\s*%/g, "").replace(/\s+/g, " ").trim();
  const [what, part] = clean.split(/\s+[–—-]\s+/, 2);
  const lead = own ? "your" : "the";
  if (!part) return `${lead} ${lowerFirst(what)}`;
  const thing = lowerFirst(what);
  return !own && PERSON.test(what) && !what.includes(" ") ? `the ${thing}'s ${lowerFirst(part)}` : `${lead} ${thing} ${lowerFirst(part)}`;
}

function whenSaid(today: string, iso: string): string {
  const d = daysBetween(today, iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  const date = new Date(`${iso}T00:00:00Z`);
  if (d > 1 && d < WINDOW) return `on ${date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}`;
  return `on ${date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}`;
}

const CLAUSE_ASK: Record<string, string> = {
  payment_schedule: "a payment schedule with receipts",
  named_people: "who will be there on the day, and who replaces them",
  supplier_cancels: "a refund clause",
};

function supplierAsk(s: SupplierProtection): string | null {
  const name = s.supplier.name;
  const before = s.next ? " before your next payment" : "";
  if (s.level === 1 && s.contract) {
    const keys = s.contract.missing.length ? s.contract.missing : s.contract.incomplete;
    if (!keys.length) return null;
    const asks = keys.map((k) => CLAUSE_ASK[k]);
    const list = asks.length === 1 ? asks[0] : `${asks.slice(0, -1).join(", ")} and ${asks[asks.length - 1]}`;
    return s.contract.missing.length ? `ask ${name} to add ${list}${before}.` : `ask ${name} to make the contract clear on ${list}${before}.`;
  }
  if (s.level === 1) return `check ${name}'s contract${before}.`;
  return `send ${name} the booking message, and keep their reply.`;
}

export function briefing(input: BriefingInput): Briefing {
  const { today, weddingDate, payments } = input;
  const items: string[] = [];
  const nameOf = (id: string | null) => input.people.find((p) => p.id === id)?.name ?? null;
  const real = payments.filter((p) => !p.is_estimate && p.status === "due" && p.due_on);

  // Overdue first, then what's due this week.
  for (const p of real.filter((p) => p.due_on! < today).sort(byDue)) {
    items.push(`${spokenMoney(p.amount_minor, p.currency)} for ${spokenTitle(p.title)} was due ${whenSaid(today, p.due_on!)} and is still to pay. Pay it, or change the date if they agreed a new one.`);
  }
  for (const p of real.filter((p) => p.due_on! >= today && daysBetween(today, p.due_on!) < WINDOW).sort(byDue)) {
    const supplier = input.suppliers.find((s) => s.id === p.supplier_id)?.name;
    const payer = p.paying_member_id && p.paying_member_id !== input.meId ? nameOf(p.paying_member_id) : null;
    items.push(`${spokenMoney(p.amount_minor, p.currency)}${supplier ? ` to ${supplier}` : ""} for ${spokenTitle(p.title)}, due ${whenSaid(today, p.due_on!)}.${payer ? ` ${payer} is covering it.` : ""}`);
  }
  // Estimates that will be due soon, with no real quote yet.
  for (const p of payments.filter((p) => p.is_estimate && p.status === "due" && p.due_on && daysBetween(today, p.due_on) <= ESTIMATE_DAYS).sort(byDue)) {
    items.push(`${spokenTitle(p.title, true)} is still an estimate. Ask for a real quote this week.`);
  }
  // Reminders they set for this week, or earlier and not done yet.
  for (const r of input.reminders.filter((r) => !r.done && daysBetween(today, r.due_on) < WINDOW).sort((a, b) => a.due_on.localeCompare(b.due_on))) {
    const text = r.text.trim().replace(/[.!]+$/, "");
    items.push(`you asked to be reminded to ${lowerFirst(text)}.`);
  }
  // The supplier the health check would fix first.
  const health = healthCheck(input);
  const first = health?.issues.find((i) => i.group === "supplier" && i.id !== "unassigned");
  const s = first ? health!.suppliers.find((x) => first.id === `supplier-${x.supplier.id}`) : null;
  const ask = s ? supplierAsk(s) : null;
  if (ask) items.push(ask);

  const shown = items.slice(0, MAX_ITEMS);
  const days = daysBetween(today, weddingDate);
  const hello = `Hello ${input.name}. ${days === 0 ? "It's your wedding day." : `${days} ${days === 1 ? "day" : "days"} to go.`}`;
  const heading = shown.length === 0 ? "Nothing needs you this week"
    : `${COUNT[shown.length]} ${shown.length === 1 ? "needs" : "need"} you this week`;
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const said = shown.map((x, i) => {
    if (shown.length === 1) return cap(x);
    if (i === 0) return `First, ${x}`;
    if (i === shown.length - 1) return `And finally, ${x}`;
    return `Next, ${x}`;
  });
  const sentences = [hello, `${heading}.`, ...said, ...(shown.length === 0 ? ["Enjoy the week. We'll tell you when something comes up."] : [])];
  return { hello, heading, items: said, sentences };
}

function byDue(a: Payment, b: Payment) { return a.due_on!.localeCompare(b.due_on!) || a.title.localeCompare(b.title); }
