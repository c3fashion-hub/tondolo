import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadMoney } from "@/lib/money-data.ts";
import { can } from "@/lib/roles.ts";
import { todayIn } from "@/lib/dates.ts";
import type { ReminderRow } from "@/lib/notes.ts";
import type { Checkin } from "@/lib/calendar.ts";
import { BriefingView } from "./BriefingView";

export const metadata: Metadata = { title: "This week's briefing" };

export default async function BriefingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadMoney(id);
  if (!can(data.me.role).seeNotes) notFound(); // the couple's briefing reads out their reminders, so it's theirs alone
  const [reminders, checkin] = await Promise.all([
    data.supabase.from("reminders").select("id, text, due_on, done").eq("wedding_id", id).eq("done", false),
    data.supabase.from("checkins").select("day, at_time, second_day, time_zone").eq("wedding_id", id).maybeSingle(),
  ]);
  return (
    <BriefingView weddingId={id} name={data.me.display_name} meId={data.me.id} today={todayIn()} unlocked={data.wedding.unlocked_at !== null}
      home={data.wedding.home_currency} weddingDate={data.wedding.wedding_date} destination={data.wedding.destination}
      payments={data.payments} budgets={data.budgets} suppliers={data.suppliers} checks={data.checks} bookings={data.bookings}
      rates={data.rates} people={data.people} reminders={(reminders.data ?? []) as ReminderRow[]} checkin={(checkin.data as Checkin | null) ?? null} />
  );
}
