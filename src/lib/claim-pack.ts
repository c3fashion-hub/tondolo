import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMinor } from "./money.ts";
import { formatLongDate } from "./dates.ts";
import { METHOD_LABEL, type Payment } from "./payments.ts";
import { MUST_HAVES, type BookingConfirmation, type ContractCheck, type Supplier, type SupplierProtection } from "./protection.ts";
import { LANGUAGE_NAME, POINT_KEYS, pointLabel } from "./messages.ts";

// The claim pack: one PDF per supplier with the booking, payment history, what the contract says,
// the booking confirmation and a dated timeline, ready for a card company, insurer or consumer body.
// It holds only what the couple entered; uploaded documents join it with scanning (stage 6).

export type ClaimInput = {
  names: string | null; destination: string | null; weddingDate: string; home: string; today: string;
  supplier: Supplier; protection: SupplierProtection; payments: Payment[];
  checks: ContractCheck[]; bookings: BookingConfirmation[];
  attachments?: Attachment[];
};

// An uploaded document, attached at the end: PDFs page by page, photos one per page.
// `bytes` is null when it was left out to keep the pack small enough to download.
export type Attachment = { name: string; kind: string | null; added: string; mime: string; bytes: Uint8Array | null };

export type TimelineEvent = { date: string; text: string; future: boolean };

const money = (m: number, c: string) => formatMinor(m, c);

export function timeline(i: ClaimInput): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  for (const p of i.payments) {
    if (p.is_estimate) continue;
    if (p.status === "paid" && p.paid_on) {
      const how = p.method ? ` by ${METHOD_LABEL[p.method].toLowerCase()}` : "";
      const st = p.statement_minor !== null && p.locked_home_currency && p.locked_home_currency !== p.currency
        ? ` (${money(p.statement_minor, p.locked_home_currency)} on the statement)` : "";
      ev.push({ date: p.paid_on, text: `Paid ${money(p.amount_minor, p.currency)}${how}: ${p.title}${st}`, future: false });
    } else if (p.due_on) {
      ev.push({ date: p.due_on, text: `${money(p.amount_minor, p.currency)} due: ${p.title}`, future: p.due_on > i.today });
    }
  }
  for (const c of i.checks) {
    const states = MUST_HAVES.map((m) => `${m.label}: ${c.clauses[m.key]?.state ?? "missing"}`).join("; ");
    ev.push({ date: c.checked_at.slice(0, 10), text: `Contract checked. ${states}`, future: false });
  }
  for (const b of i.bookings) {
    if (b.sent_on) ev.push({ date: b.sent_on, text: `Booking message sent${b.language ? ` in ${LANGUAGE_NAME[b.language]}` : ""}`, future: false });
    if (b.confirmed_on) ev.push({ date: b.confirmed_on, text: "Booking confirmed in writing by the supplier", future: false });
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------- the PDF

const A4: [number, number] = [595.28, 841.89];
const M = 50;
const INK = rgb(0.118, 0.078, 0.125);      // the design system's ink, #1E1420
const MUTED = rgb(0.416, 0.353, 0.4);      // ink-muted, #6A5A66
const LINE = rgb(0.941, 0.882, 0.902);     // line, #F0E1E6

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  doc: PDFDocument; font: PDFFont; bold: PDFFont;
  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) { this.doc = doc; this.font = font; this.bold = bold; this.newPage(); }

  newPage() { this.page = this.doc.addPage(A4); this.pages.push(this.page); this.y = A4[1] - M; }
  ensure(h: number) { if (this.y - h < M + 30) this.newPage(); }

  // The standard PDF fonts can't draw every currency symbol (₦, ₹…): fall back to the code.
  safe(text: string, f: PDFFont) {
    const set = new Set(f.getCharacterSet());
    return [...text].map((ch) => (set.has(ch.codePointAt(0)!) ? ch : ch === "₦" ? "NGN " : ch === " " || ch === " " ? " " : "?")).join("");
  }

  wrap(text: string, f: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of this.safe(text, f).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
      }
      out.push(line);
    }
    return out;
  }

  text(text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10, f = o.bold ? this.bold : this.font, x = o.x ?? M, width = o.width ?? A4[0] - M - x;
    const lines = this.wrap(text, f, size, width);
    for (const l of lines) {
      this.ensure(size * 1.4);
      this.page.drawText(l, { x, y: this.y - size, size, font: f, color: o.color ?? INK });
      this.y -= size * 1.4;
    }
    this.y -= o.gap ?? 4;
  }

  heading(text: string) { this.ensure(40); this.y -= 10; this.text(text, { size: 13, bold: true, gap: 2 }); this.rule(); }
  rule() { this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.75, color: LINE }); this.y -= 8; }

  // A row of columns, each wrapped in its own width.
  row(cells: string[], widths: number[], o: { bold?: boolean; size?: number } = {}) {
    const size = o.size ?? 9, f = o.bold ? this.bold : this.font;
    const wrapped = cells.map((c, i) => this.wrap(c, f, size, widths[i] - 6));
    const h = Math.max(...wrapped.map((w) => w.length)) * size * 1.35 + 4;
    this.ensure(h);
    let x = M;
    wrapped.forEach((lines, i) => {
      lines.forEach((l, j) => this.page.drawText(l, { x, y: this.y - size - j * size * 1.35, size, font: f, color: INK }));
      x += widths[i];
    });
    this.y -= h;
  }
}

export async function claimPackPdf(i: ClaimInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Claim pack: ${i.supplier.name}`);
  doc.setCreator("Tondolo");
  doc.setCreationDate(new Date(`${i.today}T12:00:00Z`));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);
  const s = i.supplier, pr = i.protection, home = i.home;

  w.text("Claim pack", { size: 22, bold: true, gap: 2 });
  w.text(s.name, { size: 15, bold: true, gap: 2 });
  w.text(`Prepared on ${formatLongDate(i.today)} with Tondolo, from the details the couple entered.`, { color: MUTED, gap: 10 });

  w.heading("The booking");
  const facts: [string, string | null | undefined][] = [
    ["Booked by", i.names], ["Wedding", [formatLongDate(i.weddingDate), i.destination].filter(Boolean).join(", ")],
    ["Supplier", s.legal_name && s.legal_name !== s.name ? `${s.name} (${s.legal_name})` : s.name],
    ["Contact", s.contact_name], ["Phone", s.phone], ["Email", s.email],
  ];
  for (const [k, v] of facts) if (v) w.row([k, v], [110, A4[0] - 2 * M - 110]);

  w.heading("Summary");
  const agreed = new Map<string, number>(), paid = new Map<string, number>();
  for (const p of i.payments) {
    if (p.is_estimate) continue;
    agreed.set(p.currency, (agreed.get(p.currency) ?? 0) + p.amount_minor);
    if (p.status === "paid") paid.set(p.currency, (paid.get(p.currency) ?? 0) + p.amount_minor);
  }
  const list = (m: Map<string, number>) => [...m].map(([c, v]) => money(v, c)).join(" + ") || "nothing";
  w.row(["Total agreed", `${list(agreed)} (about ${money(pr.committed, home)})`], [110, A4[0] - 2 * M - 110]);
  w.row(["Paid so far", `${list(paid)} (${money(pr.paid, home)})`], [110, A4[0] - 2 * M - 110]);
  w.row(["Still to pay", money(pr.committed - pr.paid, home)], [110, A4[0] - 2 * M - 110]);

  w.heading("Payment history");
  const cols = [78, 170, 80, 85, A4[0] - 2 * M - 413];
  w.row(["Date", "Payment", "Amount", "Status", `On the statement (${home})`], cols, { bold: true });
  const rows = i.payments.filter((p) => !p.is_estimate)
    .sort((a, b) => (a.paid_on ?? a.due_on ?? "9").localeCompare(b.paid_on ?? b.due_on ?? "9"));
  for (const p of rows) {
    const date = p.status === "paid" ? p.paid_on : p.due_on;
    const status = p.status === "paid" ? `Paid${p.method ? `, ${METHOD_LABEL[p.method].toLowerCase()}` : ""}` : "Still to pay";
    const st = p.status === "paid" && p.locked_home_minor !== null && p.locked_home_currency
      ? `${money(p.locked_home_minor, p.locked_home_currency)}${p.statement_minor === null && p.currency !== p.locked_home_currency ? " (rate on the day)" : ""}` : "";
    w.row([date ? formatLongDate(date) : "No date", p.title, money(p.amount_minor, p.currency), status, st], cols);
  }

  w.heading("What the contract says");
  const latest = [...i.checks].sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0];
  if (latest) {
    w.text(`Checked on ${formatLongDate(latest.checked_at.slice(0, 10))} against the three must-haves.`, { color: MUTED });
    for (const m of MUST_HAVES) {
      const c = latest.clauses[m.key];
      const state = c?.state === "present" ? "In the contract" : c?.state === "incomplete" ? "Incomplete" : "Missing";
      w.row([m.label.charAt(0).toUpperCase() + m.label.slice(1), state + (c?.evidence ? `: "${c.evidence}"` : "")], [170, A4[0] - 2 * M - 170]);
    }
  } else {
    w.text("No contract check recorded.", { color: MUTED });
  }

  w.heading("Booking confirmation");
  const sent = i.bookings.filter((b) => b.sent_on || b.confirmed_on);
  if (!sent.length) w.text("No booking message recorded.", { color: MUTED });
  for (const b of sent) {
    w.text([b.sent_on ? `Sent on ${formatLongDate(b.sent_on)}${b.language ? ` in ${LANGUAGE_NAME[b.language]}` : ""}` : null,
      b.confirmed_on ? `confirmed on ${formatLongDate(b.confirmed_on)}` : "not confirmed yet"].filter(Boolean).join(", ") + ".", { bold: true });
    if (b.points) for (const k of POINT_KEYS) if (b.points[k]) w.row([pointLabel("en", k), b.points[k]], [140, A4[0] - 2 * M - 140]);
    if (b.reply_evidence) w.text(`Their reply: "${b.reply_evidence}"`, { gap: 8 });
  }

  w.heading("Timeline");
  for (const e of timeline(i)) w.row([formatLongDate(e.date), `${e.text}${e.future ? " (not yet due)" : ""}`], [110, A4[0] - 2 * M - 110]);

  w.heading("Documents");
  const files = i.attachments ?? [];
  // Prepare every attachment first, so the pack's own text all comes before the attached pages.
  const attached: string[] = [], skipped: string[] = [];
  const appendix: (() => void)[] = [];
  for (const a of files) {
    const caption = `${a.name}${a.kind ? ` (${a.kind})` : ""}, added ${formatLongDate(a.added)}`;
    if (!a.bytes) { skipped.push(caption); continue; }
    try {
      if (a.mime === "application/pdf") {
        const src = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        appendix.push(() => { for (const pg of pages) { doc.addPage(pg); w.pages.push(pg); } });
      } else if (a.mime === "image/jpeg" || a.mime === "image/png") {
        const img = a.mime === "image/jpeg" ? await doc.embedJpg(a.bytes) : await doc.embedPng(a.bytes);
        appendix.push(() => {
          const page = doc.addPage(A4);
          w.pages.push(page);
          const box = { w: A4[0] - 2 * M, h: A4[1] - 2 * M - 40 };
          const scale = Math.min(box.w / img.width, box.h / img.height, 1);
          page.drawText(w.safe(caption, bold), { x: M, y: A4[1] - M - 10, size: 10, font: bold, color: INK });
          page.drawImage(img, { x: M, y: A4[1] - M - 30 - img.height * scale, width: img.width * scale, height: img.height * scale });
        });
      } else { skipped.push(caption); continue; }
      attached.push(caption);
    } catch { skipped.push(caption); }
  }
  if (attached.length) {
    w.text("Attached at the end of this pack:", { gap: 2 });
    for (const c of attached) w.text(`• ${c}`, { gap: 1 });
    w.y -= 6;
  }
  if (skipped.length) {
    w.text("Send these separately (open them from the supplier's page in Tondolo):", { gap: 2 });
    for (const c of skipped) w.text(`• ${c}`, { gap: 1 });
    w.y -= 6;
  }
  w.text("Add your card or bank statements and screenshots of messages when you send this pack.", { color: MUTED });
  for (const add of appendix) add();

  const n = w.pages.length;
  w.pages.forEach((page, idx) => {
    const foot = w.safe(`Prepared with Tondolo from the details entered. Check it against your contract, receipts and statements. Page ${idx + 1} of ${n}`, font);
    page.drawText(foot, { x: M, y: M - 20, size: 7.5, font, color: MUTED });
  });
  return doc.save();
}
