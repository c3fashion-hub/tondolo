import { currency } from "./currencies.ts";
import type { Language } from "./protection.ts";

// Messages the couple send to suppliers themselves, from their own phone (WhatsApp or email).
// Tondolo never sends anything on their behalf.
//
// The booking message is the Protection Kit's six points. English and French are the Kit's own
// templates, word for word (Mags checks the French). Portuguese and Spanish are Claude's drafts,
// to be proofread before launch. The receipt request is drafted in all four.

export const LANGUAGES: { code: Language; label: string; locale: string }[] = [
  { code: "en", label: "English", locale: "en-GB" },
  { code: "fr", label: "Français", locale: "fr-FR" },
  { code: "pt", label: "Português", locale: "pt-PT" },
  { code: "es", label: "Español", locale: "es-ES" },
];
const localeOf = (l: Language) => LANGUAGES.find((x) => x.code === l)!.locale;

// The language a supplier most likely reads, from where the wedding is.
export function languageFor(destination: string | null): Language {
  const d = (destination ?? "").toLowerCase();
  if (/portugal|brasil|brazil|cabo verde|cape verde|angola|mozambique|moçambique/.test(d)) return "pt";
  if (/spain|españa|espana|mexico|méxico|argentina|colombia|chile|peru|perú/.test(d)) return "es";
  if (/france|morocco|maroc|belgium|belgique|switzerland|suisse|senegal|sénégal|côte d'ivoire|ivory coast|tunisia|tunisie|monaco/.test(d)) return "fr";
  return "en";
}

// Money and dates written the way the supplier reads them, for example "1100 €" in Portuguese.
export function money(minor: number, code: string, lang: Language): string {
  const cur = currency(code);
  if (!cur || !Number.isSafeInteger(minor)) throw new Error(`Cannot format ${minor} ${code}`);
  const scale = 10 ** cur.minor;
  const abs = Math.abs(minor);
  const frac = abs % scale;
  const digits = frac ? cur.minor : 0;
  const exact = `${minor < 0 ? "-" : ""}${Math.floor(abs / scale)}${digits ? `.${String(frac).padStart(cur.minor, "0")}` : ""}`;
  const fmt = new Intl.NumberFormat(localeOf(lang), { style: "currency", currency: cur.code, minimumFractionDigits: digits, maximumFractionDigits: digits });
  return fmt.format(exact as unknown as number); // a decimal string, so no floating point is involved
}

export function longDate(iso: string, lang: Language): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeOf(lang), { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// ---------------------------------------------------------------- the six-point booking message

export type Points = { who: string; what: string; whenWhere: string; arrival: string; price: string };
export const POINT_KEYS = ["who", "what", "whenWhere", "arrival", "price"] as const;

const BOOKING: Record<Language, { hello: (name: string) => string; labels: Record<keyof Points, string>; cantCome: string; close: string }> = {
  en: {
    hello: (n) => `Hello ${n}, we're so happy to be booking you for our wedding! Just so we're all on the same page, could you reply to confirm these details?`,
    labels: { who: "Who", what: "What", whenWhere: "When and where", arrival: "Arrival and ready by", price: "Price" },
    cantCome: "If you can't come: you'll send a replacement we've agreed, or return our deposit.",
    close: "A quick \"Confirmed\" is perfect. Thank you so much!",
  },
  fr: {
    hello: (n) => `Bonjour ${n}, nous sommes ravis de vous réserver pour notre mariage ! Pour que tout soit clair pour chacun, pourriez-vous nous confirmer ces détails en réponse ?`,
    labels: { who: "Qui", what: "Prestation", whenWhere: "Date et lieu", arrival: "Heure d'arrivée et installation terminée", price: "Prix" },
    cantCome: "En cas d'empêchement : vous nous enverrez un remplaçant que nous aurons validé, ou vous nous rembourserez l'acompte.",
    close: "Un simple « Confirmé » nous suffit. Merci beaucoup !",
  },
  pt: { // draft, to be proofread
    hello: (n) => `Olá ${n}, estamos muito felizes por contar consigo no nosso casamento! Para que fique tudo claro, pode responder a confirmar estes detalhes?`,
    labels: { who: "Quem", what: "Serviço", whenWhere: "Data e local", arrival: "Hora de chegada e tudo pronto às", price: "Preço" },
    cantCome: "Se não puder vir: envia um substituto aprovado por nós, ou devolve o nosso sinal.",
    close: "Basta um simples «Confirmado». Muito obrigado!",
  },
  es: { // draft, to be proofread
    hello: (n) => `¡Hola ${n}! Estamos encantados de contar contigo para nuestra boda. Para que todo quede claro, ¿podrías responder confirmando estos detalles?`,
    labels: { who: "Quién", what: "Servicio", whenWhere: "Fecha y lugar", arrival: "Hora de llegada y todo listo a las", price: "Precio" },
    cantCome: "Si no puedes venir: enviarás un sustituto que hayamos aprobado o nos devolverás la señal.",
    close: "Con un simple «Confirmado» es perfecto. ¡Muchas gracias!",
  },
};

// French puts a space before a colon; the others don't.
const colon = (lang: Language) => (lang === "fr" ? " : " : ": ");

export function bookingMessage(lang: Language, name: string, points: Points): string {
  const t = BOOKING[lang];
  const lines = POINT_KEYS.map((k) => `${t.labels[k]}${colon(lang)}${points[k].trim()}`);
  return [t.hello(name.trim() || (lang === "en" ? "there" : "")).replace(/ ,/, ","), "", ...lines, "", t.cantCome, "", t.close].join("\n");
}

export const pointLabel = (lang: Language, k: keyof Points) => BOOKING[lang].labels[k];

// The parts of the six points Tondolo can write in the supplier's language.
export function whenWherePoint(lang: Language, weddingDate: string, place: string): string {
  return [longDate(weddingDate, lang), place.trim()].filter(Boolean).join(", ");
}

export function arrivalPoint(lang: Language, arrive: string, ready: string): string {
  const a = arrive.trim(), r = ready.trim();
  const p = {
    en: [`arrive at ${a}`, `everything ready by ${r}`],
    fr: [`arrivée à ${a.replace(":", "h")}`, `installation terminée à ${r.replace(":", "h")}`],
    pt: [`chegada às ${a}`, `tudo pronto às ${r}`],
    es: [`llegada a las ${a}`, `todo listo a las ${r}`],
  }[lang];
  return [a ? p[0] : null, r ? p[1] : null].filter(Boolean).join(", ");
}

export type PricePart = { total: number; paid: number; balance: number; currency: string; balanceInCash: boolean; balanceOnDay: boolean; balanceDue: string | null };

export function pricePoint(lang: Language, p: PricePart): string {
  const m = (x: number) => money(x, p.currency, lang);
  const when = p.balanceOnDay ? { en: "on the day", fr: "le jour J", pt: "no dia", es: "el día de la boda" }[lang]
    : p.balanceDue ? { en: `by ${longDate(p.balanceDue, lang)}`, fr: `avant le ${longDate(p.balanceDue, lang)}`, pt: `até ${longDate(p.balanceDue, lang)}`, es: `antes del ${longDate(p.balanceDue, lang)}` }[lang] : "";
  const cash = p.balanceInCash ? { en: "in cash", fr: "en espèces", pt: "em numerário", es: "en efectivo" }[lang] : "";
  const total = { en: `${m(p.total)} in total`, fr: `${m(p.total)} au total`, pt: `${m(p.total)} no total`, es: `${m(p.total)} en total` }[lang];
  const parts = [total];
  if (p.paid) parts.push({ en: `${m(p.paid)} deposit paid`, fr: `acompte de ${m(p.paid)} versé`, pt: `sinal de ${m(p.paid)} pago`, es: `señal de ${m(p.paid)} pagada` }[lang]);
  if (p.balance) parts.push([m(p.balance), cash, when].filter(Boolean).join(" "));
  return parts.join(lang === "fr" ? " ; " : "; ");
}

// ---------------------------------------------------------------- receipt request, after paying

export function receiptRequest(lang: Language, name: string, amount: string, what: string): string {
  const n = name.trim();
  return {
    en: `Hello${n ? ` ${n}` : ""}, we've just paid ${amount} for ${what}. Could you send us a receipt or invoice in our names, please? Thank you!`,
    fr: `Bonjour${n ? ` ${n}` : ""}, nous venons de régler ${amount} pour ${what}. Pourriez-vous nous envoyer un reçu ou une facture à nos noms ? Merci beaucoup !`,
    pt: `Olá${n ? ` ${n}` : ""}, acabámos de pagar ${amount} referente a ${what}. Pode enviar-nos o recibo ou a fatura em nosso nome? Muito obrigado!`,
    es: `Hola${n ? ` ${n}` : ""}, acabamos de pagar ${amount} por ${what}. ¿Podrías enviarnos el recibo o la factura a nuestro nombre? ¡Muchas gracias!`,
  }[lang];
}

export const LANGUAGE_NAME: Record<Language, string> = { en: "English", fr: "French", pt: "Portuguese", es: "Spanish" };

// ---------------------------------------------------------------- opening the couple's own apps

// wa.me wants the number in international form, digits only. Without a number, WhatsApp asks who to send it to.
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? "").replace(/^00/, "").replace(/\D/g, "");
  return `https://wa.me/${digits.length >= 6 ? digits : ""}?text=${encodeURIComponent(text)}`;
}

export function emailLink(to: string | null | undefined, subject: string, body: string): string {
  return `mailto:${encodeURIComponent((to ?? "").trim()).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function bookingSubject(lang: Language): string {
  return { en: "Our wedding booking", fr: "Notre réservation de mariage", pt: "A nossa reserva para o casamento", es: "Nuestra reserva para la boda" }[lang];
}
