import type { Payment } from "../payments.ts";
import type { RateRow } from "../rates.ts";
import type { BookingConfirmation, ContractCheck, Supplier } from "../protection.ts";

// The approved example wedding from the spec (Porto, Saturday 26 June 2027), as of
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
export const DESTINATION = "Porto, Portugal";
export const WEDDING_DATE = "2027-06-26";

export const SUPPLIERS: Supplier[] = [
  { id: "s-quinta", name: "Quinta do Rio" }, { id: "s-sabores", name: "Sabores do Douro" }, { id: "s-magali", name: "Magali Events" },
  { id: "s-luz", name: "Luz Studio" },
  { id: "s-rita", name: "Rita Beauty", contact_name: "Rita", phone: "+351 912 000 000", language: "pt" },
  { id: "s-fado", name: "Fado Duo" },
];
const all3 = { payment_schedule: { state: "present" as const }, named_people: { state: "present" as const }, supplier_cancels: { state: "present" as const } };
export const CONTRACT_CHECKS: ContractCheck[] = [
  { supplier_id: "s-quinta", checked_at: "2026-06-10T10:00:00Z", clauses: {
    payment_schedule: { state: "present" },
    named_people: { state: "incomplete", evidence: "Names the coordinator but not who replaces her" },
    supplier_cancels: { state: "missing" },
  } },
  { supplier_id: "s-sabores", checked_at: "2026-10-01T10:00:00Z", clauses: all3 },
  { supplier_id: "s-magali", checked_at: "2026-04-28T10:00:00Z", clauses: all3 },
];
export const BOOKINGS: BookingConfirmation[] = [
  { supplier_id: "s-luz", arrive_at: "13:00", confirmed_on: "2026-08-18" },
  { supplier_id: "s-rita", arrive_at: "08:30", confirmed_on: "2026-09-12", sent_on: "2026-09-10", language: "pt",
    points: { who: "Rita, plus one assistant", what: "Hair and make-up for Ade and 3 others", whenWhere: "sábado, 26 de junho de 2027, Quinta do Rio, Porto",
      arrival: "chegada às 08:30, tudo pronto às 12:30", price: "1100 € no total, com deslocação e IVA incluídos; sinal de 200 € pago; 900 € em numerário no dia" },
    reply_evidence: "Confirmado! Até lá, Rita" },
  { supplier_id: "s-fado", arrive_at: null, confirmed_on: "2026-10-05" },
];
export const TUNDE = "m-tunde";

export const PAYMENTS: Payment[] = [
  paid({ title: "Planner – deposit 30%", supplier_id: "s-magali", amount_minor: 180000, category: "Wedding planner / coordinator", paid_on: "2026-05-02", statement_minor: 153200, method: "credit_card", protected: "yes" }),
  paid({ title: "Venue hire – deposit 30%", supplier_id: "s-quinta", amount_minor: 780000, category: "Venue hire", paid_on: "2026-06-15", statement_minor: 700000, method: "bank_transfer", protected: "no", tax_included: false, tax_rate_bp: 2300 }),
  paid({ title: "Photographer – deposit 30%", supplier_id: "s-luz", amount_minor: 75000, category: "Photography", paid_on: "2026-08-20", statement_minor: 66100, method: "credit_card", protected: "yes", paying_member_id: TUNDE }),
  paid({ title: "Hair and make-up – deposit", supplier_id: "s-rita", amount_minor: 20000, category: "Hair and make-up", paid_on: "2026-09-14", statement_minor: 17800, method: "bank_transfer" }),
  p({ title: "Caterer – deposit 30%", supplier_id: "s-sabores", amount_minor: 336000, category: "Catering", due_on: "2026-10-23", method: "credit_card", paying_member_id: MUM }),
  p({ title: "Planner – second payment 40%", supplier_id: "s-magali", amount_minor: 240000, category: "Wedding planner / coordinator", due_on: "2026-12-26" }),
  p({ title: "Venue hire – balance 70%", supplier_id: "s-quinta", amount_minor: 1820000, category: "Venue hire", due_on: "2027-05-26", tax_included: false, tax_rate_bp: 2300 }),
  p({ title: "Planner – final 30%", supplier_id: "s-magali", amount_minor: 180000, category: "Wedding planner / coordinator", due_on: "2027-05-26" }),
  p({ title: "Photographer – balance", supplier_id: "s-luz", amount_minor: 175000, category: "Photography", due_on: "2027-05-26", paying_member_id: TUNDE }),
  p({ title: "Caterer – balance after final numbers", supplier_id: "s-sabores", amount_minor: 784000, category: "Catering", due_on: "2027-06-12", paying_member_id: MUM }),
  p({ title: "Hair and make-up – balance", handover_time: "09:00", handover_by: "Sam's sister", supplier_id: "s-rita", amount_minor: 90000, category: "Hair and make-up", due_on: "2027-06-26", method: "cash" }),
  p({ title: "Musicians – ceremony", handover_time: "16:30", handover_note: "after the ceremony", handover_by: "Best man", supplier_id: "s-fado", amount_minor: 50000, category: "Music, DJ and sound", due_on: "2027-06-26", method: "cash" }),
  p({ title: "Supplier food allowance", handover_time: "13:00", handover_by: "Magali", amount_minor: 30000, category: "Supplier food allowance", due_on: "2027-06-26", method: "cash" }),
  p({ title: "Tips for staff and drivers", handover_note: "end of the night", handover_by: "Best man", amount_minor: 40000, category: "Final invoices, overtime and tips", due_on: "2027-06-26", method: "cash" }),
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
  { id: "m-magali", name: "Magali", role: "planner" as const, payer_currency: null },
  { id: MUM, name: "Mum", role: "family" as const, payer_currency: "GBP" },
  { id: TUNDE, name: "Uncle Tunde", role: "family" as const, payer_currency: "NGN" },
];
