import type { Metadata } from "next";
import { loadWedding, type Member } from "@/lib/wedding.ts";
import { can } from "@/lib/roles.ts";
import { Settings } from "./Settings";
import { todayIn } from "@/lib/dates.ts";
import type { Checkin } from "@/lib/calendar.ts";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, wedding, me } = await loadWedding(id);
  const { data } = await supabase
    .from("members")
    .select("id, user_id, role, status, display_name, invite_email, invite_expires_at, payer_currency")
    .eq("wedding_id", id)
    .neq("status", "removed")
    .order("created_at");
  const [{ data: checkin }, { data: mine }] = await Promise.all([
    supabase.from("checkins").select("day, at_time, second_day, time_zone").eq("wedding_id", id).maybeSingle(),
    supabase.from("members").select("email_reminders, weekly_summary").eq("id", me.id).maybeSingle(),
  ]);
  return (
    <Settings wedding={wedding} me={me} members={(data ?? []) as Member[]} myEmail={user.email ?? ""} rights={can(me.role)}
      checkin={(checkin as Checkin | null) ?? null} emails={{ reminders: !!mine?.email_reminders, weekly: !!mine?.weekly_summary }} today={todayIn()} />
  );
}
