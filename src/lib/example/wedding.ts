import type { Payment } from "../payments.ts";
import type { RateRow } from "../rates.ts";

// The approved-for-review example wedding from the spec (Porto, Saturday 26 June 2027), as of
// Sunday 18 October 2026. Rates are 1 EUR = £0.86 today and the mid-market rates on each day paid,
// stored to 10 decimal places as the database does.
export const TODAY = "2026-10-18";
export const RATES: RateRow[] = [
  { on_date: "2026-05-02", currency: "EUR", per_gbp: "1.1750881316" },
  { on_date: "2026-06-15", currency: "EUR", per_gbp: "1.1695906433" },
  { on_date: "2026-08-20", currency: "EUR", per_gbp: "1.1507479862" },
  { on_date: "2026-09-14", currency: "EUR", per_gbp: "1.1574074074" },
  { on_date: "2026-10-18", currency: "EUR", per_gbp: "1.1627906977" },
  { on_date: "2026-10-18", currency: "NGN", per_gbp: "2000.0000000000" },
];

let n = 0;
function p(over: Partial<Payment> & Pick<Payment, "title" | "amount_minor" | "category">): Payment {
  return {
    id: `p${++n}`, currency: "EUR", status: "due", due_on: null, paid_on: null, is_estimate: false, paying_member_id: null,
    supplier_id: null, method: null, protected: "not_sure", tax_included: null, tax_rate_bp: null, fees_minor: null,
    statement_minor: null, locked_home_minor: null, locked_home_currency: null, notes: null, due_offset_days: null, ...over,
  };
}
const paid = (over: Parameters<typeof p>[0] & { paid_on: string; statement_minor: number }) =>
  p({ ...over, status: "paid", locked_home_minor: over.statement_minor, locked_home_currency: "GBP" });

export const MUM = "m-mum";
export const TUNDE = "m-tunde";

export const PAYMENTS: Payment[] = [
  paid({ title: "Planner – deposit 30%", amount_minor: 180000, category: "Wedding planner / coordinator", paid_on: "2026-05-02", statement_minor: 153200, method: "credit_card", protected: "yes" }),
  paid({ title: "Venue hire – deposit 30%", amount_minor: 780000, category: "Venue hire", paid_on: "2026-06-15", statement_minor: 700000, method: "bank_transfer", protected: "no" }),
  paid({ title: "Photographer – deposit 30%", amount_minor: 75000, category: "Photography", paid_on: "2026-08-20", statement_minor: 66100, method: "credit_card", protected: "yes", paying_member_id: TUNDE }),
  paid({ title: "Hair and make-up – deposit", amount_minor: 20000, category: "Hair and make-up", paid_on: "2026-09-14", statement_minor: 17800, method: "bank_transfer" }),
  p({ title: "Caterer – deposit 30%", amount_minor: 336000, category: "Catering", due_on: "2026-10-23", method: "credit_card", paying_member_id: MUM }),
  p({ title: "Planner – second payment 40%", amount_minor: 240000, category: "Wedding planner / coordinator", due_on: "2026-12-26" }),
  p({ title: "Venue hire – balance 70%", amount_minor: 1820000, category: "Venue hire", due_on: "2027-05-26", tax_included: false, tax_rate_bp: 2300 }),
  p({ title: "Planner – final 30%", amount_minor: 180000, category: "Wedding planner / coordinator", due_on: "2027-05-26" }),
  p({ title: "Photographer – balance", amount_minor: 175000, category: "Photography", due_on: "2027-05-26", paying_member_id: TUNDE }),
  p({ title: "Caterer – balance after final numbers", amount_minor: 784000, category: "Catering", due_on: "2027-06-12", paying_member_id: MUM }),
  p({ title: "Hair and make-up – balance", amount_minor: 90000, category: "Hair and make-up", due_on: "2027-06-26", method: "cash" }),
  p({ title: "Musicians – ceremony", amount_minor: 50000, category: "Music, DJ and sound", due_on: "2027-06-26", method: "cash" }),
  p({ title: "Supplier food allowance", amount_minor: 30000, category: "Supplier food allowance", due_on: "2027-06-26", method: "cash" }),
  p({ title: "Tips for staff and drivers", amount_minor: 40000, category: "Final invoices, overtime and tips", due_on: "2027-06-26", method: "cash" }),
  p({ title: "DJ and sound – deposit", amount_minor: 42000, category: "Music, DJ and sound", due_on: "2026-11-01", is_estimate: true }),
  p({ title: "DJ and sound – balance", amount_minor: 98000, category: "Music, DJ and sound", due_on: "2027-05-26", is_estimate: true }),
  p({ title: "Supplier flights", amount_minor: 90000, category: "Supplier flights", due_on: "2027-04-26", is_estimate: true }),
  p({ title: "Supplier accommodation", amount_minor: 75000, category: "Supplier accommodation", due_on: "2027-04-26", is_estimate: true }),
];

export const BUDGETS = [
  ["Wedding planner / coordinator", 550000], ["Wedding insurance", 30000], ["Currency, card and bank fees", 20000], ["Contingency", 200000],
  ["Legal paperwork, apostilles and translations", 30000], ["Officiant / celebrant", 40000],
  ["Venue hire", 2300000], ["Venue extras: permits, generator, security, cleaning, toilets", 100000],
  ["Catering", 1050000],
  ["Photography", 230000], ["Hair and make-up", 100000], ["Music, DJ and sound", 170000], ["Florals and décor", 100000],
  ["Supplier flights", 80000], ["Supplier accommodation", 70000], ["Supplier food allowance", 50000],
  ["Welcome bags and favours", 150000],
  ["Wedding dress and alterations", 300000], ["Suit and alterations", 100000], ["Shoes, accessories and cultural outfits", 50000],
  ["Final invoices, overtime and tips", 80000],
].map(([category, amount_minor]) => ({ category: category as string, amount_minor: amount_minor as number }));

export const PEOPLE = [
  { id: "m-ade", name: "Ade", role: "owner" as const, payer_currency: null },
  { id: "m-sam", name: "Sam", role: "partner" as const, payer_currency: null },
  { id: "m-bisi", name: "Bisi", role: "planner" as const, payer_currency: null },
  { id: MUM, name: "Mum", role: "family" as const, payer_currency: "GBP" },
  { id: TUNDE, name: "Uncle Tunde", role: "family" as const, payer_currency: "NGN" },
];
