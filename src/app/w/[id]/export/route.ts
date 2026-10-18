import { loadMoney } from "@/lib/money-data.ts";
import { RateBook } from "@/lib/rates.ts";
import { can } from "@/lib/roles.ts";
import { todayIn } from "@/lib/dates.ts";
import { exportFileName, exportSheets } from "@/lib/export.ts";
import { xlsx } from "@/lib/xlsx.ts";
import type { NoteRow, ReminderRow } from "@/lib/notes.ts";

// Everything the signed-in person can see, as an Excel spreadsheet (opens in Numbers and Google
// Sheets too). Row-level security decides what's included; notes only for the two partners.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadMoney(id);
  const rights = can(data.me.role);
  const today = todayIn();
  const [notes, reminders] = rights.seeNotes
    ? await Promise.all([
      data.supabase.from("notes").select("id, words, kind, supplier_id, noted_on").eq("wedding_id", id).order("noted_on", { ascending: false }),
      data.supabase.from("reminders").select("id, text, due_on, done").eq("wedding_id", id).order("due_on"),
    ])
    : [null, null];
  const sheets = exportSheets({
    names: data.wedding.names, destination: data.wedding.destination, weddingDate: data.wedding.wedding_date, home: data.wedding.home_currency,
    today, role: data.me.role, payments: data.payments, budgets: data.budgets, suppliers: data.suppliers,
    people: data.people.map((p) => ({ name: p.name, role: p.role })), documents: data.documents,
    notes: notes ? (notes.data ?? []) as NoteRow[] : null, reminders: reminders ? (reminders.data ?? []) as ReminderRow[] : null,
    book: new RateBook(data.rates),
  });
  return new Response(xlsx(sheets) as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName(data.wedding.names, today)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
