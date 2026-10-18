import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadMoney } from "@/lib/money-data.ts";
import { can } from "@/lib/roles.ts";
import { todayIn } from "@/lib/dates.ts";
import type { NoteRow, ReminderRow } from "@/lib/notes.ts";
import { NotesView } from "./NotesView";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadMoney(id);
  if (!can(data.me.role).seeNotes) notFound(); // the two partners only; the database enforces it too
  const [notes, reminders] = await Promise.all([
    data.supabase.from("notes").select("id, words, kind, supplier_id, noted_on").eq("wedding_id", id).order("created_at", { ascending: false }).limit(200),
    data.supabase.from("reminders").select("id, text, due_on, done").eq("wedding_id", id).order("due_on"),
  ]);
  return (
    <NotesView weddingId={id} home={data.wedding.home_currency} today={todayIn()} unlocked={data.wedding.unlocked_at !== null}
      notes={(notes.data ?? []) as NoteRow[]} reminders={(reminders.data ?? []) as ReminderRow[]}
      suppliers={data.suppliers} payments={data.payments} />
  );
}
