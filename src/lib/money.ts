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
// `whole` rounds half up to whole units, for totals and converted amounts ("£2,890 today").
export function formatMinor(minor: number, currencyCode: string, opts: { showPence?: boolean; whole?: boolean } = {}): string {
  const cur = currency(currencyCode);
  if (!cur || !Number.isSafeInteger(minor)) throw new Error(`Cannot format ${minor} ${currencyCode}`);
  const scale = 10 ** cur.minor;
  if (opts.whole && cur.minor > 0) {
    const sign = minor < 0 ? -1 : 1;
    return formatMinor(sign * divRound(Math.abs(minor), scale) * scale, currencyCode);
  }
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

// Integer division of whole numbers, rounding half up (both non-negative). No floating-point error.
export function divRound(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b <= 0) throw new Error(`divRound(${a}, ${b})`);
  const q = Math.floor(a / b);
  const r = a - q * b; // exact: corrects any rounding in the division above
  const fixedQ = r < 0 ? q - 1 : r >= b ? q + 1 : q;
  const fixedR = a - fixedQ * b;
  return fixedR * 2 >= b ? fixedQ + 1 : fixedQ;
}

// "23" or "23.5" (%) to basis points (2300, 2350). Null if blank or not a percentage from 0 to 100.
export function parsePercentToBp(input: string): number | null {
  const s = input.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  const bp = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return bp <= 10000 ? bp : null;
}

// Minor units to the plain text a person would type back in ("1250.5" -> "1,250.50").
export function minorToInput(minor: number, currencyCode: string): string {
  return formatMinor(minor, currencyCode, { showPence: true }).replace(/^[^\d-]+/, "").replace(/[^\d.,]/g, "");
}
