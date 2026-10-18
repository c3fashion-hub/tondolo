// Add-to-calendar: .ics files for Apple and Outlook (RFC 5545), and Google Calendar links.
// Payments are all-day events on their due date with reminders 14 and 3 days before. The weekly
// check-in is a 15-minute repeating event in the couple's time zone, with a second weekly slot in
// the final six weeks.

export type CalPayment = { id: string; title: string; amountText: string; due_on: string; supplier?: string | null };
export type Checkin = { day: number; at_time: string; second_day: number | null; time_zone: string };

const APP = "https://tondolo.app";
const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]; // ISO weekday 1..7
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Text values escape backslashes, semicolons, commas and newlines.
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines longer than 75 octets are folded with CRLF and a space (never splitting a character).
export function fold(line: string): string {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (bytes(line) <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (bytes(cur + ch) > (parts.length ? 74 : 75)) { parts.push(cur); cur = ch; } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const compact = (iso: string) => iso.replace(/-/g, "");
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function calendar(events: string[][], name: string, extra: string[] = []): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tondolo//Wedding payments//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`, ...extra, ...events.flat(), "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
}

const alarm = (days: number, text: string) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(text)}`, `TRIGGER:-P${days}D`, "END:VALARM"];

export function paymentsIcs(payments: CalPayment[], weddingId: string, now = new Date()): string {
  const events = payments.map((p) => [
    "BEGIN:VEVENT",
    `UID:payment-${p.id}@tondolo.app`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compact(p.due_on)}`,
    `DTEND;VALUE=DATE:${compact(addDays(p.due_on, 1))}`,
    `SUMMARY:${icsText(`${p.amountText} due: ${p.title}`)}`,
    `DESCRIPTION:${icsText(`${p.amountText}${p.supplier ? ` to ${p.supplier}` : ""}. See it in Tondolo: ${APP}/w/${weddingId}/payments`)}`,
    `URL:${APP}/w/${weddingId}/payments`,
    "TRANSP:TRANSPARENT",
    ...alarm(14, `${p.title} is due in 14 days`),
    ...alarm(3, `${p.title} is due in 3 days`),
    "END:VEVENT",
  ]);
  return calendar(events, "Wedding payments");
}

export function googlePaymentLink(p: CalPayment, weddingId: string): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${p.amountText} due: ${p.title}`,
    dates: `${compact(p.due_on)}/${compact(addDays(p.due_on, 1))}`,
    details: `${p.amountText}${p.supplier ? ` to ${p.supplier}` : ""}. See it in Tondolo: ${APP}/w/${weddingId}/payments`,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// The first date on or after `from` that falls on ISO weekday `day`.
export function nextWeekday(from: string, day: number): string {
  const [y, m, d] = from.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  return addDays(from, (day - dow + 7) % 7);
}

const endTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + 15;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}${String(total % 60).padStart(2, "0")}00`;
};

// Europe/London's clock changes, so calendars place the check-in at the same local time all year.
const LONDON = ["BEGIN:VTIMEZONE", "TZID:Europe/London",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0000", "TZOFFSETTO:+0100", "TZNAME:BST", "DTSTART:19700329T010000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0000", "TZNAME:GMT", "DTSTART:19701025T020000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE"];

export type CheckinSlot = { key: string; day: number; from: string; until: string };

// The weekly slot from today until the wedding; the second slot from six weeks before the wedding.
export function checkinSlots(c: Checkin, today: string, weddingDate: string): CheckinSlot[] {
  const slots: CheckinSlot[] = [];
  const first = nextWeekday(today, c.day);
  if (first <= weddingDate) slots.push({ key: "weekly", day: c.day, from: first, until: weddingDate });
  if (c.second_day) {
    const sixWeeks = addDays(weddingDate, -42);
    const start = nextWeekday(today > sixWeeks ? today : sixWeeks, c.second_day);
    if (start <= weddingDate) slots.push({ key: "final-weeks", day: c.second_day, from: start, until: weddingDate });
  }
  return slots;
}

export function checkinIcs(c: Checkin, weddingId: string, names: string | null, today: string, weddingDate: string, now = new Date()): string {
  const tz = c.time_zone || "Europe/London";
  const time = c.at_time.replace(":", "") + "00";
  const events = checkinSlots(c, today, weddingDate).map((s) => [
    "BEGIN:VEVENT",
    `UID:checkin-${s.key}-${weddingId}@tondolo.app`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;TZID=${tz}:${compact(s.from)}T${time}`,
    `DTEND;TZID=${tz}:${compact(s.from)}T${endTime(c.at_time)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${DAY_CODES[s.day - 1]};UNTIL=${compact(s.until)}T235959Z`,
    `SUMMARY:${icsText(`Wedding money check-in${names ? `: ${names}` : ""}`)}`,
    `DESCRIPTION:${icsText(`15 minutes together: open Tondolo and play this week's briefing. ${APP}/w/${weddingId}`)}`,
    `URL:${APP}/w/${weddingId}`,
    ...alarm(0, "Your wedding money check-in").map((l) => (l === "TRIGGER:-P0D" ? "TRIGGER:-PT10M" : l)),
    "END:VEVENT",
  ]);
  return calendar(events, "Wedding check-in", tz === "Europe/London" ? LONDON : []);
}

export function googleCheckinLink(c: Checkin, s: CheckinSlot, weddingId: string, names: string | null): string {
  const time = c.at_time.replace(":", "") + "00";
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `Wedding money check-in${names ? `: ${names}` : ""}`,
    dates: `${compact(s.from)}T${time}/${compact(s.from)}T${endTime(c.at_time)}`,
    ctz: c.time_zone || "Europe/London",
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${DAY_CODES[s.day - 1]};UNTIL=${compact(s.until)}T235959Z`,
    details: `15 minutes together: open Tondolo and play this week's briefing. ${APP}/w/${weddingId}`,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// "Sundays 7pm", "Sundays 7pm, plus Wednesdays in the final six weeks".
export function checkinLabel(c: Checkin): string {
  const [h, m] = c.at_time.split(":").map(Number);
  const t = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  return `${DAY_NAMES[c.day - 1]}s ${t}${c.second_day ? `, plus ${DAY_NAMES[c.second_day - 1]}s in the final six weeks` : ""}`;
}
