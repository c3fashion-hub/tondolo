import { test } from "node:test";
import assert from "node:assert/strict";
import { RateBook } from "../../src/lib/rates.ts";
import { cashPlan, whenLabel } from "../../src/lib/cash.ts";
import { paySafely } from "../../src/lib/pay-safely.ts";
import {
  arrivalPoint, bookingMessage, emailLink, languageFor, money, pricePoint, receiptRequest, whatsappLink, whenWherePoint,
} from "../../src/lib/messages.ts";
import { claimPackPdf, timeline, type ClaimInput } from "../../src/lib/claim-pack.ts";
import { protectionFor } from "../../src/lib/protection.ts";
import {
  BOOKINGS, CONTRACT_CHECKS, DESTINATION, PAYMENTS, RATES, SUPPLIERS, TODAY, WEDDING_DATE,
} from "../../src/lib/example/wedding.ts";

const book = new RateBook(RATES);

test("the cash plan matches the on-the-day payments: €2,100, withdraw by Thu 24 June", () => {
  const plan = cashPlan(PAYMENTS, WEDDING_DATE);
  assert.deepEqual(plan.totals, [{ currency: "EUR", minor: 210_000 }]);
  assert.equal(plan.withdrawBy, "2027-06-24");
  assert.equal(plan.days.length, 1);
  assert.deepEqual(plan.days[0].envelopes.map((e) => [e.payment.title, e.payment.amount_minor, e.when, e.payment.handover_by]), [
    ["Hair and make-up – balance", 90_000, "09:00", "Sam's sister"],
    ["Supplier food allowance", 30_000, "13:00", "Bisi"],
    ["Musicians – ceremony", 50_000, "16:30, after the ceremony", "Best man"],
    ["Tips for staff and drivers", 40_000, "End of the night", "Best man"],
  ]);
  assert.deepEqual(plan.undecided, []);
});

test("paid, card and estimate payments stay out of the cash plan", () => {
  const paidCash = { ...PAYMENTS[10], status: "paid" as const };
  const plan = cashPlan([paidCash, PAYMENTS[4], PAYMENTS[14]], WEDDING_DATE);
  assert.equal(plan.days.length, 0);
  assert.equal(plan.withdrawBy, null);
  assert.equal(whenLabel({ handover_time: null, handover_note: null }), "Time not set");
});

test("the French booking message is the Kit's template, word for word", () => {
  const msg = bookingMessage("fr", "Rita", {
    who: "Rita, plus une assistante", what: "coiffure et maquillage", whenWhere: whenWherePoint("fr", WEDDING_DATE, "Quinta do Rio, Porto"),
    arrival: arrivalPoint("fr", "08:30", "12:30"), price: "1 100 €",
  });
  assert.equal(msg, [
    "Bonjour Rita, nous sommes ravis de vous réserver pour notre mariage ! Pour que tout soit clair pour chacun, pourriez-vous nous confirmer ces détails en réponse ?",
    "",
    "Qui : Rita, plus une assistante",
    "Prestation : coiffure et maquillage",
    "Date et lieu : sam. 26 juin 2027, Quinta do Rio, Porto",
    "Heure d'arrivée et installation terminée : arrivée à 08h30, installation terminée à 12h30",
    "Prix : 1 100 €",
    "",
    "En cas d'empêchement : vous nous enverrez un remplaçant que nous aurons validé, ou vous nous rembourserez l'acompte.",
    "",
    "Un simple « Confirmé » nous suffit. Merci beaucoup !",
  ].join("\n"));
});

test("the English booking message follows the Kit", () => {
  const msg = bookingMessage("en", "Rita", { who: "Rita", what: "Hair", whenWhere: "x", arrival: "y", price: "z" });
  assert.match(msg, /^Hello Rita, we're so happy to be booking you for our wedding! Just so we're all on the same page, could you reply to confirm these details\?\n\nWho: Rita\nWhat: Hair\nWhen and where: x\nArrival and ready by: y\nPrice: z\n\nIf you can't come: you'll send a replacement we've agreed, or return our deposit\.\n\nA quick "Confirmed" is perfect\. Thank you so much!$/);
});

test("a WhatsApp link opens the message in French, to the supplier's number", () => {
  const url = whatsappLink("+351 912 000 000", "Bonjour Rita, « Confirmé » ?");
  assert.equal(url, "https://wa.me/351912000000?text=Bonjour%20Rita%2C%20%C2%AB%20Confirm%C3%A9%20%C2%BB%20%3F");
  assert.equal(new URL(url).searchParams.get("text"), "Bonjour Rita, « Confirmé » ?");
  assert.equal(whatsappLink(null, "Hi"), "https://wa.me/?text=Hi", "no number: WhatsApp asks who to send it to");
  assert.equal(whatsappLink("0044 7700 900123", "Hi"), "https://wa.me/447700900123?text=Hi");
  assert.equal(emailLink("rita@example.pt", "Olá", "a b"), "mailto:rita@example.pt?subject=Ol%C3%A1&body=a%20b");
});

const plain = (t: string) => t.replace(/[\u00a0\u202f]/g, " "); // Intl uses no-break spaces, which are right in a message

test("the price point is written in the supplier's language, from the payments", () => {
  const p = { total: 110_000, paid: 20_000, balance: 90_000, currency: "EUR", balanceInCash: true, balanceOnDay: true, balanceDue: WEDDING_DATE };
  assert.equal(pricePoint("en", p), "€1,100 in total; €200 deposit paid; €900 in cash on the day");
  assert.equal(plain(pricePoint("pt", p)), "1100 € no total; sinal de 200 € pago; 900 € em numerário no dia");
  assert.equal(plain(pricePoint("fr", p)), "1 100 € au total ; acompte de 200 € versé ; 900 € en espèces le jour J");
  assert.equal(plain(pricePoint("es", { ...p, balanceInCash: false, balanceOnDay: false, balanceDue: "2027-05-26" })), "1100 € en total; señal de 200 € pagada; 900 € antes del mié, 26 de mayo de 2027");
  assert.equal(plain(money(42, "XOF", "fr")), "42 F CFA");
});

test("the supplier's language comes from where the wedding is", () => {
  assert.equal(languageFor("Porto, Portugal"), "pt");
  assert.equal(languageFor("Marrakech, Morocco"), "fr");
  assert.equal(languageFor("Seville, Spain"), "es");
  assert.equal(languageFor("Lake Como, Italy"), "en");
  assert.match(receiptRequest("pt", "Rita", "200 €", "o sinal"), /^Olá Rita, acabámos de pagar 200 € referente a o sinal\./);
});

test("Pay this safely: UK credit card for the caterer's deposit, in euros, with a fatura", () => {
  const caterer = PAYMENTS[4];
  const advice = paySafely({ payment: caterer, home: "GBP", destination: DESTINATION, supplierName: "Sabores do Douro", itemHome: 963_200, contractGaps: null });
  assert.deepEqual(advice.map((a) => a.title), ["Pay by credit card, in euros", "If they only take bank transfer", "Always pay in euros", "Ask for a fatura"]);
  assert.match(advice[0].body, /Section 75/);
  assert.equal(advice[2].body, "If the card machine asks \"Pay in pounds?\", say no. Their rate is usually worse.");
});

test("Pay this safely: fix the contract first, and no UK guidance for cards from elsewhere", () => {
  const balance = PAYMENTS[6];
  const uk = paySafely({ payment: balance, home: "GBP", destination: DESTINATION, supplierName: "Quinta do Rio", itemHome: 2_265_200, contractGaps: "1 must-have missing, 1 incomplete" });
  assert.equal(uk[0].title, "Fix the contract first");
  const us = paySafely({ payment: balance, home: "USD", destination: DESTINATION, supplierName: "Quinta do Rio", itemHome: 2_600_000, contractGaps: null });
  assert.equal(us[0].body, "Check what protection your card or bank offers.");
  for (const a of us) assert.doesNotMatch(a.body, /Section 75|chargeback/);
  const big = paySafely({ payment: balance, home: "GBP", destination: DESTINATION, supplierName: "Quinta do Rio", itemHome: 3_500_000, contractGaps: null });
  assert.match(big[0].body, /outside Section 75/);
  const cash = paySafely({ payment: PAYMENTS[10], home: "GBP", destination: DESTINATION, supplierName: "Rita Beauty", itemHome: 95_200, contractGaps: null });
  assert.ok(cash.some((a) => a.title === "Paying in cash"));
  for (const a of [...uk, ...us, ...big, ...cash]) assert.doesNotMatch(`${a.title} ${a.body}`, /\b(safe|protected)\b/i);
});

const quinta = SUPPLIERS[0];
const claim: ClaimInput = {
  names: "Ade & Sam", destination: DESTINATION, weddingDate: WEDDING_DATE, home: "GBP", today: TODAY,
  supplier: quinta, protection: protectionFor(quinta, PAYMENTS, CONTRACT_CHECKS, BOOKINGS, WEDDING_DATE, "GBP", book, TODAY),
  payments: PAYMENTS.filter((p) => p.supplier_id === quinta.id), checks: CONTRACT_CHECKS.filter((c) => c.supplier_id === quinta.id), bookings: [],
};

test("the claim pack's timeline is dated and in order", () => {
  assert.deepEqual(timeline(claim).map((e) => [e.date, e.text, e.future]), [
    ["2026-06-10", "Contract checked. payment schedule with receipts: present; named people and substitutes: incomplete; refund if the supplier cancels: missing", false],
    ["2026-06-15", "Paid €7,800 by bank transfer: Venue hire – deposit 30% (£7,000 on the statement)", false],
    ["2027-05-26", "€18,200 due: Venue hire – balance 70%", true],
  ]);
});

test("the claim pack is a real PDF, and copes with currencies the PDF font can't draw", async () => {
  const bytes = await claimPackPdf(claim);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.ok(bytes.length > 2000);
  const naira = await claimPackPdf({ ...claim, home: "NGN", protection: { ...claim.protection, committed: 4_530_400_000, paid: 1_400_000_000 } });
  assert.equal(Buffer.from(naira.slice(0, 5)).toString(), "%PDF-");
});

test("the claim pack attaches uploaded documents, and lists any it had to leave out", async () => {
  const { PDFDocument } = await import("pdf-lib");
  const contract = await PDFDocument.create();
  contract.addPage(); contract.addPage();
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const bytes = await claimPackPdf({ ...claim, attachments: [
    { name: "contrato.pdf", kind: "contract", added: "2026-06-10", mime: "application/pdf", bytes: await contract.save() },
    { name: "receipt.png", kind: "receipt", added: "2026-06-15", mime: "image/png", bytes: png },
    { name: "big-scan.pdf", kind: "invoice", added: "2026-06-16", mime: "application/pdf", bytes: null },
  ] });
  const pack = await PDFDocument.load(bytes);
  const own = (await PDFDocument.load(await claimPackPdf(claim))).getPageCount();
  // The pack's own pages (the list of documents may add one), then two contract pages and one photo page.
  assert.ok(pack.getPageCount() >= own + 3 && pack.getPageCount() <= own + 4, `${pack.getPageCount()} pages`);
});
