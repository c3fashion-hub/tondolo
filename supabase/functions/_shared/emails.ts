// The reminder and weekly summary emails: subject, plain text and simple HTML. Shared by the
// send-reminders function and the app's tests. Plain TypeScript with no imports (Deno and Node).
// Calm, plain British English; never promises money is safe.

export type DueItem = {
  title: string; amount_minor: number; currency: string; minor_digits: number;
  home_minor: number | null; home_currency: string; home_minor_digits: number;
  due_on: string; days_left: number; supplier_name: string | null; payer_name: string | null;
};

export type Email = { subject: string; text: string; html: string };

// Money from minor units with exact decimal strings, never floating point.
export function money(minor: number, code: string, digits: number, whole = false): string {
  const scale = 10 ** digits;
  let m = Math.abs(minor);
  if (whole && digits) m = Math.floor((m + scale / 2) / scale) * scale;
  const frac = m % scale;
  const showFrac = digits > 0 && frac !== 0;
  const exact = `${Math.floor(m / scale)}${showFrac ? `.${String(frac).padStart(digits, "0")}` : ""}`;
  const text = new Intl.NumberFormat("en-GB", { style: "currency", currency: code, minimumFractionDigits: showFrac ? digits : 0, maximumFractionDigits: showFrac ? digits : 0 })
    .format(exact as unknown as number);
  return minor < 0 ? `-${text}` : text;
}

function parse(iso: string) { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export const longDate = (iso: string) => parse(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);

const when = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function itemLine(i: DueItem): string {
  const amount = money(i.amount_minor, i.currency, i.minor_digits);
  const to = i.supplier_name ? ` to ${i.supplier_name}` : "";
  const home = i.currency !== i.home_currency && i.home_minor !== null
    ? ` About ${money(i.home_minor, i.home_currency, i.home_minor_digits, true)} at today's rate.` : "";
  const payer = i.payer_name ? ` ${i.payer_name} is paying.` : "";
  return `${amount}${to} for ${i.title}, due ${longDate(i.due_on)} (${when(i.days_left)}).${home}${payer}`;
}

// The page shell every email uses: the design system's paper, ink and raspberry, system fonts.
function shell(title: string, body: string, footer: string): string {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#FFF8F5;color:#1E1420;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px 20px;">
<p style="margin:0 0 20px;font-family:Georgia,serif;font-size:22px;font-weight:600;color:#3B1631;">tondolo</p>
${body}
<p style="margin:28px 0 0;font-size:12px;line-height:18px;color:#6A5A66;">${footer}</p>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0;"><a href="${esc(href)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#C2255C;color:#FFFFFF;font-weight:600;text-decoration:none;">${esc(label)}</a></p>`;

export function reminderEmail(o: { displayName: string; names: string | null; items: DueItem[]; paymentsUrl: string; settingsUrl: string }): Email {
  const items = [...o.items].sort((a, b) => a.days_left - b.days_left);
  const first = items[0];
  const subject = items.length === 1
    ? `${first.title}: ${money(first.amount_minor, first.currency, first.minor_digits)} due ${when(first.days_left)}`
    : `${items.length} payments due ${items.some((i) => i.days_left <= 3) ? "soon" : "in the next two weeks"}`;
  const hello = `Hello ${o.displayName},`;
  const intro = items.length === 1 ? "A payment for your wedding is coming up." : `${items.length} payments for your wedding are coming up.`;
  const advice = "Before you pay: use a card if you can, pay in the supplier's currency, and keep the receipt. Tondolo's Pay this safely shows how.";
  const footer = `You're getting this because you turned on payment reminders${o.names ? ` for ${o.names}` : ""}. Change your emails in Settings: ${o.settingsUrl}`;
  const text = [hello, "", intro, "", ...items.map((i) => `- ${itemLine(i)}`), "", advice, "", `Open your payments: ${o.paymentsUrl}`, "", footer].join("\n");
  const html = shell(subject, `<p style="margin:0 0 12px;font-size:16px;">${esc(hello)}</p>
<p style="margin:0 0 12px;font-size:16px;line-height:24px;">${esc(intro)}</p>
<ul style="margin:0 0 12px;padding-left:20px;font-size:16px;line-height:24px;">${items.map((i) => `<li style="margin:0 0 8px;">${esc(itemLine(i))}</li>`).join("")}</ul>
<p style="margin:0;font-size:14px;line-height:20px;color:#6A5A66;">${esc(advice)}</p>
${button(o.paymentsUrl, "Open your payments")}`,
    `You're getting this because you turned on payment reminders${o.names ? ` for ${esc(o.names)}` : ""}. <a href="${esc(o.settingsUrl)}" style="color:#C2255C;">Change your emails in Settings</a>.`);
  return { subject, text, html };
}

export type SummaryInput = {
  displayName: string; names: string | null; destination: string; weddingDate: string; today: string;
  homeCurrency: string; homeDigits: number; committed: number; paid: number; checkinTime: string | null;
  dueSoon: { title: string; amount_minor: number; currency: string; minor_digits: number; home_minor: number | null; due_on: string }[];
  overdue: { title: string; amount_minor: number; currency: string; minor_digits: number; due_on: string }[];
  overviewUrl: string; settingsUrl: string;
};

export function summaryEmail(s: SummaryInput): Email {
  const days = daysBetween(s.today, s.weddingDate);
  const h = (m: number) => money(m, s.homeCurrency, s.homeDigits, true);
  const subject = days === 0 ? "Your wedding day" : `Your week: ${days} ${days === 1 ? "day" : "days"} to go`;
  const lines: string[] = [];
  lines.push(`${days} ${days === 1 ? "day" : "days"} to go${s.names ? `, ${s.names}` : ""} in ${s.destination}.`);
  lines.push(`Committed so far: ${h(s.committed)}. Paid: ${h(s.paid)}. Still to pay: ${h(s.committed - s.paid)}.`);
  const soon = s.dueSoon.map((d) => `${money(d.amount_minor, d.currency, d.minor_digits)} for ${d.title}, due ${longDate(d.due_on)}${d.currency !== s.homeCurrency && d.home_minor !== null ? ` (about ${h(d.home_minor)})` : ""}`);
  const late = s.overdue.map((d) => `${money(d.amount_minor, d.currency, d.minor_digits)} for ${d.title}, due ${longDate(d.due_on)}`);
  const check = s.checkinTime ? `Your check-in is today at ${s.checkinTime}. Open Tondolo together and play the briefing.` : null;
  const footer = `You're getting this weekly summary because you asked for it. Change your emails in Settings: ${s.settingsUrl}`;
  const text = [
    `Hello ${s.displayName},`, "", ...lines, "",
    soon.length ? "Due in the next two weeks:" : "Nothing is due in the next two weeks.", ...soon.map((x) => `- ${x}`),
    ...(late.length ? ["", "Past their due date, still to pay:", ...late.map((x) => `- ${x}`)] : []),
    ...(check ? ["", check] : []), "", `Open Tondolo: ${s.overviewUrl}`, "", footer,
  ].join("\n");
  const list = (xs: string[]) => `<ul style="margin:0 0 12px;padding-left:20px;font-size:16px;line-height:24px;">${xs.map((x) => `<li style="margin:0 0 6px;">${esc(x)}</li>`).join("")}</ul>`;
  const html = shell(subject, `<p style="margin:0 0 12px;font-size:16px;">${esc(`Hello ${s.displayName},`)}</p>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:24px;">${esc(l)}</p>`).join("")}
<p style="margin:16px 0 6px;font-size:16px;font-weight:600;">${soon.length ? "Due in the next two weeks" : "Nothing is due in the next two weeks."}</p>
${soon.length ? list(soon) : ""}
${late.length ? `<p style="margin:16px 0 6px;font-size:16px;font-weight:600;">Past their due date, still to pay</p>${list(late)}` : ""}
${check ? `<p style="margin:12px 0;font-size:16px;line-height:24px;">${esc(check)}</p>` : ""}
${button(s.overviewUrl, "Open Tondolo")}`,
    `You're getting this weekly summary because you asked for it. <a href="${esc(s.settingsUrl)}" style="color:#C2255C;">Change your emails in Settings</a>.`);
  return { subject, text, html };
}

// Today's date where the couple live (the reminders say "in 3 days" by their calendar).
export function todayIn(timeZone = "Europe/London", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
