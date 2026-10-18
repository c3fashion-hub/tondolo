import { test } from "node:test";
import assert from "node:assert/strict";
import { money, reminderEmail, summaryEmail, todayIn, type DueItem } from "../../supabase/functions/_shared/emails.ts";
import { checkinIcs, checkinLabel, checkinSlots, fold, googleCheckinLink, googlePaymentLink, icsText, nextWeekday, paymentsIcs } from "../../src/lib/calendar.ts";

const caterer: DueItem = {
  title: "Caterer – deposit 30%", amount_minor: 336_000, currency: "EUR", minor_digits: 2,
  home_minor: 289_000, home_currency: "GBP", home_minor_digits: 2, due_on: "2026-10-23", days_left: 3,
  supplier_name: "Sabores do Douro", payer_name: "Mum",
};
const links = { paymentsUrl: "https://tondolo.app/w/abc/payments", settingsUrl: "https://tondolo.app/w/abc/settings" };

test("a payment due in 3 days gets a clear reminder email", () => {
  const e = reminderEmail({ displayName: "Ade", names: "Ade & Sam", items: [caterer], ...links });
  assert.equal(e.subject, "Caterer – deposit 30%: €3,360 due in 3 days");
  assert.match(e.text, /^Hello Ade,\n\nA payment for your wedding is coming up\.\n\n- €3,360 to Sabores do Douro for Caterer – deposit 30%, due Friday 23 October \(in 3 days\)\. About £2,890 at today's rate\. Mum is paying\./);
  assert.match(e.text, /Change your emails in Settings: https:\/\/tondolo\.app\/w\/abc\/settings$/);
  assert.match(e.html, /<a href="https:\/\/tondolo\.app\/w\/abc\/payments"/);
  assert.doesNotMatch(e.text + e.html, /\b(safe|protected)\b(?! shows)/i);
});

test("several payments go in one email, soonest first, and names are escaped in HTML", () => {
  const e = reminderEmail({ displayName: "Bisi", names: "Ade & Sam", ...links, items: [
    { ...caterer, title: "Planner – second payment 40%", due_on: "2026-11-01", days_left: 14, supplier_name: null, payer_name: null },
    { ...caterer, title: "Cake <special>", days_left: 0, due_on: "2026-10-18" },
  ] });
  assert.equal(e.subject, "2 payments due soon");
  assert.ok(e.text.indexOf("Cake <special>") < e.text.indexOf("Planner"));
  assert.match(e.text, /due Sunday 18 October \(today\)/);
  assert.match(e.html, /Cake &lt;special&gt;/);
  assert.match(e.html, /Ade &amp; Sam/);
});

test("the weekly summary gives days to go, totals and what's coming up", () => {
  const e = summaryEmail({
    displayName: "Ade", names: "Ade & Sam", destination: "Porto, Portugal", weddingDate: "2027-06-26", today: "2026-10-18",
    homeCurrency: "GBP", homeDigits: 2, committed: 4_157_800, paid: 937_100, checkinTime: "19:00",
    dueSoon: [{ title: "Caterer – deposit 30%", amount_minor: 336_000, currency: "EUR", minor_digits: 2, home_minor: 289_000, due_on: "2026-10-23" }],
    overdue: [], overviewUrl: "https://tondolo.app/w/abc", settingsUrl: links.settingsUrl,
  });
  assert.equal(e.subject, "Your week: 251 days to go");
  assert.match(e.text, /Committed so far: £41,578\. Paid: £9,371\. Still to pay: £32,207\./);
  assert.match(e.text, /- €3,360 for Caterer – deposit 30%, due Friday 23 October \(about £2,890\)/);
  assert.match(e.text, /Your check-in is today at 19:00\./);
});

test("email money uses exact decimals, never floating point", () => {
  assert.equal(money(336_000, "EUR", 2), "€3,360");
  assert.equal(money(345_65, "GBP", 2), "£345.65");
  assert.equal(money(345_65, "GBP", 2, true), "£346");
  assert.match(money(655_957, "XOF", 0), /655,957/, "no minor units");
  assert.equal(todayIn("Europe/London", new Date("2026-10-18T23:30:00Z")), "2026-10-19", "after midnight in London");
});

const p = { id: "p5", title: "Caterer – deposit 30%", amountText: "€3,360", due_on: "2026-10-23", supplier: "Sabores do Douro" };

test("a payment's calendar file is an all-day event with reminders 14 and 3 days before", () => {
  const ics = paymentsIcs([p], "abc", new Date("2026-10-18T09:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /DTSTART;VALUE=DATE:20261023\r\nDTEND;VALUE=DATE:20261024\r\n/);
  assert.match(ics, /SUMMARY:€3\\,360 due: Caterer – deposit 30%\r\n/);
  assert.match(ics, /TRIGGER:-P14D/);
  assert.match(ics, /TRIGGER:-P3D/);
  assert.match(ics, /UID:payment-p5@tondolo\.app/);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const g = new URL(googlePaymentLink(p, "abc"));
  assert.equal(g.searchParams.get("dates"), "20261023/20261024");
});

test("text is escaped and long lines are folded without breaking characters", () => {
  assert.equal(icsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const long = "DESCRIPTION:" + "é".repeat(60);
  const folded = fold(long);
  assert.ok(folded.split("\r\n ").every((l, i) => new TextEncoder().encode(l).length <= (i ? 74 : 75)));
  assert.equal(folded.replace(/\r\n /g, ""), long);
});

const checkin = { day: 7, at_time: "19:00", second_day: 3, time_zone: "Europe/London" };

test("the check-in is Sundays at 7pm, plus Wednesdays from six weeks before the wedding", () => {
  assert.equal(checkinLabel(checkin), "Sundays 7pm, plus Wednesdays in the final six weeks");
  assert.equal(checkinLabel({ ...checkin, at_time: "08:30", second_day: null }), "Sundays 8:30am");
  assert.equal(nextWeekday("2026-10-18", 7), "2026-10-18", "today is a Sunday");
  assert.equal(nextWeekday("2026-10-18", 3), "2026-10-21");
  assert.deepEqual(checkinSlots(checkin, "2026-10-18", "2027-06-26"), [
    { key: "weekly", day: 7, from: "2026-10-18", until: "2027-06-26" },
    { key: "final-weeks", day: 3, from: "2027-05-19", until: "2027-06-26" }, // from Sat 15 May, the first Wednesday is 19 May
  ]);
  const ics = checkinIcs(checkin, "abc", "Ade & Sam", "2026-10-18", "2027-06-26", new Date("2026-10-18T09:00:00Z"));
  assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:Europe\/London/);
  assert.match(ics, /DTSTART;TZID=Europe\/London:20261018T190000\r\nDTEND;TZID=Europe\/London:20261018T191500\r\nRRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20270626T235959Z/);
  assert.match(ics, /DTSTART;TZID=Europe\/London:20270519T190000\r\n.*\r\nRRULE:FREQ=WEEKLY;BYDAY=WE;/);
  assert.match(ics, /TRIGGER:-PT10M/);
  const g = new URL(googleCheckinLink(checkin, checkinSlots(checkin, "2026-10-18", "2027-06-26")[0], "abc", "Ade & Sam"));
  assert.equal(g.searchParams.get("ctz"), "Europe/London");
  assert.equal(g.searchParams.get("recur"), "RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20270626T235959Z");
});

test("a late-night check-in ends after midnight correctly, and none are made after the wedding", () => {
  const ics = checkinIcs({ ...checkin, at_time: "23:50", second_day: null }, "abc", null, "2026-10-18", "2027-06-26");
  assert.match(ics, /DTEND;TZID=Europe\/London:20261018T000500/);
  assert.deepEqual(checkinSlots(checkin, "2027-06-27", "2027-06-26"), []);
});
