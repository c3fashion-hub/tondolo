import type { Payment } from "./payments.ts";
import type { Tone } from "@/components/ui/StatusChip";

// Pay this safely: what to do before paying this one payment, from the Protection Kit's money map,
// payment rules and country notes. UK guidance (Section 75, chargeback) only for UK cards, which at
// launch means couples paying in pounds; everyone else gets the general wording.

export type Advice = { key: string; title: string; body: string; tone?: Tone; chip?: string };

const NAMES: Record<string, string> = {
  EUR: "euros", GBP: "pounds", USD: "dollars", MAD: "dirhams", AED: "dirhams", THB: "baht", MXN: "pesos", ZAR: "rand",
  TRY: "lira", NGN: "naira", GHS: "cedis", KES: "shillings", XOF: "CFA francs", JMD: "Jamaican dollars", CHF: "Swiss francs",
  CAD: "Canadian dollars", AUD: "Australian dollars", INR: "rupees", IDR: "rupiah", EGP: "Egyptian pounds", TND: "dinars",
};
export const currencyWords = (code: string) => NAMES[code] ?? code;

export type PaySafelyInput = {
  payment: Payment;
  home: string;
  destination: string | null;
  supplierName: string | null;
  itemHome: number | null;        // what the whole booking costs in the home currency (Section 75 looks at the item price)
  contractGaps: string | null;    // "1 must-have missing, 1 incomplete" for a Level 1 supplier, else null
};

const S75_MIN = 10_000, S75_MAX = 3_000_000; // £100 to £30,000, in pence

export function paySafely(i: PaySafelyInput): Advice[] {
  const { payment: p, home } = i;
  const ukCards = home === "GBP";
  const foreign = p.currency !== home;
  const local = currencyWords(p.currency);
  const who = i.supplierName ?? "the supplier";
  const out: Advice[] = [];

  if (i.contractGaps) {
    out.push({ key: "contract", tone: "risk", chip: "Before you pay", title: "Fix the contract first",
      body: `The contract with ${who} has ${i.contractGaps}. Ask them to add what's missing before you pay this.` });
  }

  if (ukCards && i.itemHome !== null && i.itemHome > S75_MAX) {
    out.push({ key: "card", tone: "paid", chip: "Best option", title: `Pay by card${foreign ? `, in ${local}` : ""}`,
      body: "Over £30,000 is outside Section 75, but paying by card still lets your bank raise a chargeback, usually within 120 days of when you expected the service." });
  } else if (ukCards && i.itemHome !== null && i.itemHome < S75_MIN) {
    out.push({ key: "card", tone: "paid", chip: "Best option", title: "A card, or cash with a receipt",
      body: "Small amounts like this are fine by card or cash. Keep the receipt, even a WhatsApp message saying it's received." });
  } else if (ukCards) {
    out.push({ key: "card", tone: "paid", chip: "Best option", title: `Pay by credit card${foreign ? `, in ${local}` : ""}`,
      body: `UK credit cards usually cover purchases from £100 to £30,000 if the supplier lets you down (Section 75). Pay ${who} directly from the main cardholder's card, not through a planner or PayPal.` });
  } else {
    out.push({ key: "card", tone: "paid", chip: "Best option", title: `Pay by card if you can${foreign ? `, in ${local}` : ""}`,
      body: "Check what protection your card or bank offers." });
  }

  if (p.method === "cash") {
    out.push({ key: "cash", title: "Paying in cash",
      body: "Count it with them when you hand it over, and get a written receipt or at least a message saying it's been received." });
  } else {
    out.push({ key: "transfer", title: "If they only take bank transfer",
      body: `Use a specialist transfer service rather than your bank: often under 1% instead of 2 to 4%. Call ${who} on a number you already have to check the bank details before you send.` });
  }

  if (foreign) {
    out.push({ key: "local", tone: "due", title: `Always pay in ${local}`,
      body: `If the card machine asks "Pay in ${currencyWords(home)}?", say no. Their rate is usually worse.` });
  }

  const d = (i.destination ?? "").toLowerCase();
  if (/portugal/.test(d)) {
    out.push({ key: "fatura", title: "Ask for a fatura", body: "In Portugal, ask for an invoice with your names and tax number (NIF) if you have one. If you don't, ask for your full names and address on it instead." });
  } else if (/morocco|maroc/.test(d)) {
    out.push({ key: "receipt", title: "Ask for a receipt", body: "In Morocco, get a signed receipt for every payment, even when paying in cash on the day." });
  }
  return out;
}

export const PAY_SAFELY_NOTICE = "General information, not legal or financial advice. Check with your card provider, bank or a professional.";
