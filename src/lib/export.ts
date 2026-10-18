import { currency } from "./currencies.ts";
import { homeValue, METHOD_LABEL, type Payment } from "./payments.ts";
import type { RateBook } from "./rates.ts";
import type { Role } from "./roles.ts";
import { ROLE_LABEL } from "./roles.ts";
import type { Supplier } from "./protection.ts";
import type { NoteRow, ReminderRow } from "./notes.ts";
import type { Cell, Sheet } from "./xlsx.ts";

// "Download everything as a spreadsheet at any time" (spec). Each person gets what they can see in
// the app: row-level security decides what's loaded, and the couple alone get their notes.

export type ExportInput = {
  names: string | null; destination: string | null; weddingDate: string; home: string; today: string; role: Role;
  payments: Payment[]; budgets: { category: string; amount_minor: number }[]; suppliers: Supplier[];
  people: { name: string; role: Role }[]; documents: { file_name: string; kind: string | null; created_at: string }[];
  notes: NoteRow[] | null; reminders: ReminderRow[] | null; book: RateBook;
};

// Minor units as an exact decimal number for the spreadsheet: 336000 EUR -> "3360.00".
export function decimal(minor: number, code: string): Cell {
  const digits = currency(code)?.minor ?? 2;
  if (!digits) return { n: String(minor) };
  const s = String(Math.abs(minor)).padStart(digits + 1, "0");
  return { n: `${minor < 0 ? "-" : ""}${s.slice(0, -digits)}.${s.slice(-digits)}` };
}

const yesNo = (v: boolean | null) => (v === null ? "" : v ? "Yes" : "No");
// Basis points as an exact percentage: 2300 -> "23", 650 -> "6.50".
const percent = (bp: number): Cell => ({ n: bp % 100 ? `${Math.trunc(bp / 100)}.${String(bp % 100).padStart(2, "0")}` : String(bp / 100) });
const PROTECTED: Record<Payment["protected"], string> = { yes: "Yes", no: "No", not_sure: "Not sure" };

export function exportSheets(x: ExportInput): Sheet[] {
  const supplierName = (id: string | null) => x.suppliers.find((s) => s.id === id)?.name ?? "";
  const status = (p: Payment) => p.is_estimate ? "Estimate" : p.status === "paid" ? "Paid" : p.due_on && p.due_on < x.today ? "Overdue" : "To pay";
  const basis = (p: Payment) => p.currency === x.home ? "" : p.status === "paid"
    ? (p.statement_minor !== null ? "From your statement" : "Locked on the day paid") : "Today's rate (a guide)";

  const about: Sheet = { name: "About", widths: [24, 70], rows: [
    ["Tondolo", "Your wedding money"],
    ["Wedding", [x.names, x.destination].filter(Boolean).join(", ")],
    ["Date", x.weddingDate],
    ["Home currency", x.home],
    ["Downloaded", x.today],
    ["Amounts", "Each payment is shown in the currency charged and in your home currency. Paid amounts are locked; amounts still to pay use today's rate, which is a guide and can differ from what your bank or card charges."],
    ["Please check", "Tondolo reads documents, converts currencies and suggests actions automatically, and technology can get things wrong. Always check amounts, dates and details against your contracts, invoices and bank statements."],
  ] };

  const payments: Sheet = { name: "Payments", rows: [
    ["Payment", "Supplier", "Budget line", "Status", "Amount", "Currency", `Value in ${x.home}`, "Value basis", "Due", "Paid on",
      "How paid", "Protected", "Statement amount", "Fees", "Tax included", "Tax rate %", "Notes"],
    ...x.payments.map((p): Cell[] => {
      const v = homeValue(p, x.home, x.book, x.today);
      return [
        p.title, supplierName(p.supplier_id), p.category ?? "", status(p), decimal(p.amount_minor, p.currency), p.currency,
        v === null ? "" : decimal(v, x.home), basis(p), p.due_on ?? "", p.paid_on ?? "",
        p.method ? METHOD_LABEL[p.method] : "", PROTECTED[p.protected],
        p.statement_minor !== null ? decimal(p.statement_minor, x.home) : "", p.fees_minor !== null ? decimal(p.fees_minor, x.home) : "",
        yesNo(p.tax_included), p.tax_rate_bp !== null ? percent(p.tax_rate_bp) : "",
        p.notes ?? "",
      ];
    }),
  ] };

  const sheets: Sheet[] = [about, payments];
  if (x.role !== "family") {
    sheets.push({ name: "Budget", rows: [["Budget line", `Budget in ${x.home}`], ...x.budgets.map((b): Cell[] => [b.category, decimal(b.amount_minor, x.home)])] });
    sheets.push({ name: "Suppliers", rows: [["Supplier", "Legal name", "Contact", "Phone", "Email", "Language"],
      ...x.suppliers.map((s): Cell[] => [s.name, s.legal_name ?? "", s.contact_name ?? "", s.phone ?? "", s.email ?? "", s.language ?? ""])] });
    sheets.push({ name: "Documents", rows: [["File", "Kind", "Added"],
      ...x.documents.map((d): Cell[] => [d.file_name, d.kind ?? "", d.created_at.slice(0, 10)])] });
  }
  sheets.push({ name: "People", rows: [["Name", "Role"], ...x.people.map((m): Cell[] => [m.name, ROLE_LABEL[m.role]])] });
  if (x.notes) {
    sheets.push({ name: "Notes", rows: [["Date", "Kind", "Supplier", "Words"],
      ...x.notes.map((n): Cell[] => [n.noted_on, n.kind === "booking_detail" ? "Booking detail" : "Note", supplierName(n.supplier_id), n.words])] });
  }
  if (x.reminders) {
    sheets.push({ name: "Reminders", rows: [["Due", "Reminder", "Done"], ...x.reminders.map((r): Cell[] => [r.due_on, r.text, r.done ? "Yes" : "No"])] });
  }
  return sheets;
}

export function exportFileName(names: string | null, today: string): string {
  const slug = (names ?? "wedding").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 40) || "wedding";
  return `tondolo-${slug}-${today}.xlsx`;
}
