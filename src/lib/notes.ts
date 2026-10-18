import { formatMinor, parseAmountToMinor } from "./money.ts";
import { METHOD_LABEL, type Method, type Payment } from "./payments.ts";
import type { Supplier } from "./protection.ts";
import type { NoteAction, NoteResult } from "../../supabase/functions/_shared/notes.ts";

// Notes in the app: the words the couple typed or dictated, and what we suggest filing from them.
// Nothing is saved until a person ticks a suggestion and taps Save note.

export type { NoteAction, NoteResult };
export type NoteRow = { id: string; words: string; kind: "note" | "booking_detail"; supplier_id: string | null; noted_on: string };
export type ReminderRow = { id: string; text: string; due_on: string; done: boolean };

export const NOTE_ERRORS: Record<string, string> = {
  locked: "Suggestions from your notes come with Tondolo unlocked. You can still save the note as it is.",
  ai_limit: "You've used this wedding's suggestions for now. You can still save the note as it is.",
  not_allowed: "Only the two of you can use notes.",
  not_configured: "Suggestions aren't switched on yet. You can still save the note as it is.",
  too_long: "That note is a little long. Split it into two.",
  unreadable: "We couldn't work out anything to file. You can still save the note as it is.",
  network: "We couldn't reach Tondolo. Check your connection and try again.",
  busy: "We couldn't read that just now. Try again in a minute.",
};
export const noteError = (code: string | undefined) => NOTE_ERRORS[code ?? ""] ?? NOTE_ERRORS.busy;

export const ASK_ERRORS: Record<string, string> = {
  ...NOTE_ERRORS,
  locked: "Questions come with Tondolo unlocked.",
  ai_limit: "You've used this wedding's questions for now.",
  not_allowed: "Questions aren't available for your role.",
  not_configured: "Questions aren't switched on yet.",
  too_long: "That question is a little long. Try a shorter one.",
  unreadable: "We couldn't answer that. Try asking it another way.",
};
export const askError = (code: string | undefined) => ASK_ERRORS[code ?? ""] ?? ASK_ERRORS.busy;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// A paid amount in minor units, or null if it can't be read exactly.
export function actionMinor(a: NoteAction, fallbackCurrency: string): { minor: number; currency: string } | null {
  const code = a.currency ?? fallbackCurrency;
  const minor = a.amount ? parseAmountToMinor(a.amount, code) : null;
  return minor && minor > 0 ? { minor, currency: code } : null;
}

// The currency a new payment is in when the note didn't say: the one most payments still to pay use.
export function usualCurrency(payments: Payment[], home: string): string {
  const counts = new Map<string, number>();
  for (const p of payments) if (p.status === "due") counts.set(p.currency, (counts.get(p.currency) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? home;
}

// One line for each suggestion, as the couple will see it before saving.
export function actionLabel(a: NoteAction, ctx: { suppliers: Supplier[]; payments: Payment[]; today: string; fallbackCurrency: string }): string {
  const supplier = ctx.suppliers.find((s) => s.id === a.supplier_id)?.name ?? a.supplier_name;
  if (a.type === "payment_paid") {
    const m = actionMinor(a, ctx.fallbackCurrency);
    const amount = m ? formatMinor(m.minor, m.currency) : "";
    const how = a.method ? `, ${METHOD_LABEL[a.method as Method].toLowerCase()}` : "";
    const when = a.date && a.date !== ctx.today ? `, paid ${shortDate(a.date)}` : "";
    if (a.payment_id) {
      const p = ctx.payments.find((x) => x.id === a.payment_id);
      return `Mark as paid: ${p?.title ?? a.title}, ${amount}${how}${when}`;
    }
    const title = a.title ?? (supplier ? `${supplier} – payment` : "Payment");
    return `Add a paid payment: ${title}, ${amount}${how}${when}`;
  }
  if (a.type === "booking_detail") return `Add to ${supplier ? `${supplier}'s` : "the"} booking: ${lowerFirst(a.text ?? "")}`;
  return `Remind you on ${shortDate(a.date!)}: ${lowerFirst(a.text ?? "")}`;
}
