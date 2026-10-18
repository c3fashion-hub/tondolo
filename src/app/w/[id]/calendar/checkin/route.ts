import { loadWedding } from "@/lib/wedding.ts";
import { todayIn } from "@/lib/dates.ts";
import { checkinIcs, type Checkin } from "@/lib/calendar.ts";

// The weekly check-in as a repeating calendar event (Apple Calendar and Outlook).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, wedding } = await loadWedding(id);
  const { data } = await supabase.from("checkins").select("day, at_time, second_day, time_zone").eq("wedding_id", id).maybeSingle();
  if (!data) return new Response("No check-in set", { status: 404 });
  const ics = checkinIcs(data as Checkin, id, wedding.names, todayIn(), wedding.wedding_date);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="wedding-check-in.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
