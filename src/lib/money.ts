import { currency } from "./currencies.ts";

// Parses what a person types ("40,000", "£1,250.50", "1 200") into whole minor
// units, using string arithmetic only. Returns null when it isn't a valid amount.
export function parseAmountToMinor(input: string, currencyCode: string): number | null {
  const cur = currency(currencyCode);
  if (!cur || input.includes("-")) return null;
  const cleaned = input.trim().replace(/^[^\d.]+/, "").replace(/[\s,\u00a0]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > cur.minor) return null;
  const digits = (whole.replace(/^0+(?=\d)/, "") + frac.padEnd(cur.minor, "0")).replace(/^0+(?=\d)/, "");
  const minor = Number(digits);
  return Number.isSafeInteger(minor) ? minor : null;
}

// Formats minor units for display, e.g. 4000000 GBP -> "£40,000".
export function formatMinor(minor: number, currencyCode: string, opts: { showPence?: boolean } = {}): string {
  const cur = currency(currencyCode);
  if (!cur || !Number.isSafeInteger(minor)) throw new Error(`Cannot format ${minor} ${currencyCode}`);
  const scale = 10 ** cur.minor;
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / scale);
  const frac = abs % scale;
  const showFrac = cur.minor > 0 && (opts.showPence || frac !== 0);
  const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: cur.code, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const wholeText = fmt.format(whole);
  const text = showFrac ? `${wholeText}.${String(frac).padStart(cur.minor, "0")}` : wholeText;
  return negative ? `-${text}` : text;
}
