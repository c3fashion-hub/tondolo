"use client";

import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, TextField } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { DAY_NAMES, type Checkin } from "@/lib/calendar.ts";

// The weekly check-in: 15 minutes together to play the briefing. Twice a week in the final six weeks.
export function CheckinSheet({ open, weddingId, checkin, onClose, onDone }: {
  open: boolean; weddingId: string; checkin: Checkin | null; onClose: () => void; onDone: () => void;
}) {
  const [day, setDay] = useState(checkin?.day ?? 7);
  const [time, setTime] = useState(checkin?.at_time ?? "19:00");
  const [twice, setTwice] = useState(checkin ? checkin.second_day !== null : true);
  const [second, setSecond] = useState(checkin?.second_day ?? 3);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) { setError("Choose a time, for example 19:00."); return; }
    if (twice && second === day) { setError("Choose a different second day."); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().from("checkins").upsert({
      wedding_id: weddingId, day, at_time: time, second_day: twice ? second : null, time_zone: "Europe/London", updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { setError("We couldn't save that just now. Try again."); return; }
    onDone();
  }

  const daySelect = (id: string, label: string, value: number, set: (n: number) => void) => (
    <div className="tn-field">
      <label className="tn-field-label" htmlFor={id}>{label}</label>
      <select id={id} className="tn-input" value={value} onChange={(e) => set(Number(e.target.value))}>
        {DAY_NAMES.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
      </select>
    </div>
  );

  return (
    <Sheet open={open} title="Weekly check-in" onClose={onClose}>
      <form className="tn-stack" onSubmit={save} noValidate>
        <p>Fifteen minutes together each week to open Tondolo and play the briefing. Pick a time you&rsquo;re both usually free.</p>
        {daySelect("ci-day", "Day", day, setDay)}
        <TextField label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint="UK time" />
        <label className="tn-field-label" style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44 }}>
          <input type="checkbox" checked={twice} onChange={(e) => setTwice(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--raspberry)" }} />
          Twice a week in the final six weeks
        </label>
        {twice ? daySelect("ci-second", "Second day", second, setSecond) : null}
        {error ? <p className="tn-alert" role="alert">{error}</p> : null}
        <Button type="submit" block disabled={busy}>{busy ? "Saving…" : "Save check-in"}</Button>
      </form>
    </Sheet>
  );
}
