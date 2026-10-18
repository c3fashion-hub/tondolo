import type { NoteResult } from "../notes.ts";
import { RateBook } from "../rates.ts";
import { formatMinor } from "../money.ts";
import { PAYMENTS, RATES, TODAY } from "./wedding.ts";

// What reading notes and answering questions returns for the example wedding, for the local
// preview and tests. The real answers come from the read-note and ask-question functions.
const none = { payment_id: null, supplier_id: null, supplier_name: null, title: null, category: null, amount: null, currency: null, method: null, date: null, text: null };

export function exampleNote(words: string): NoteResult {
  const w = words.toLowerCase();
  if (/florist/.test(w) && /500/.test(w)) {
    return { supplier_id: null, actions: [{ ...none, type: "payment_paid", supplier_name: "Florist", title: "Florist", category: "Florals and décor", amount: "500", currency: "EUR", method: "cash", date: TODAY }] };
  }
  if (/rita/.test(w) && /150/.test(w)) {
    return { supplier_id: "s-rita", actions: [
      { ...none, type: "payment_paid", supplier_id: "s-rita", title: "Hair and make-up trial", category: "Hair and make-up", amount: "150", currency: "EUR", method: "cash", date: TODAY },
      { ...none, type: "booking_detail", supplier_id: "s-luz", text: "Arrives at 13:00" },
      { ...none, type: "reminder", text: "Send Rita your inspiration photos", date: "2026-10-25" },
    ] };
  }
  return { supplier_id: null, actions: [] };
}

export function exampleAnswer(question: string): string {
  const book = new RateBook(RATES);
  if (/owe|still to pay|left to pay/i.test(question)) {
    const due = PAYMENTS.filter((p) => !p.is_estimate && p.status === "due" && p.currency === "EUR");
    const eur = due.reduce((a, p) => a + p.amount_minor, 0);
    const gbp = due.reduce((a, p) => a + (book.convert(p.amount_minor, "EUR", "GBP", TODAY) ?? 0), 0);
    return `You still owe ${formatMinor(eur, "EUR")} across ${due.length} payments, about ${formatMinor(gbp, "GBP", { whole: true })} at today's rate. The next is €3,360 to Sabores do Douro for the caterer's deposit, due on Friday, and Mum is covering it.`;
  }
  return "This preview only answers questions like “What do I still owe in euros?”";
}
