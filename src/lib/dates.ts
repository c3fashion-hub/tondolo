// Dates are stored as YYYY-MM-DD (the wedding's own calendar day), so they're handled as UTC
// to avoid shifting a day in other time zones.
function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatLongDate(iso: string): string {
  return parse(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function formatShortDate(iso: string): string {
  return parse(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// Whole days from `today` to `iso`, both YYYY-MM-DD.
export function daysBetween(today: string, iso: string): number {
  return Math.round((parse(iso).getTime() - parse(today).getTime()) / 86_400_000);
}

export function todayIn(timeZone = "Europe/London", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
