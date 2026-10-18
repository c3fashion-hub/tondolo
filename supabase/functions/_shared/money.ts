// Money from minor units for emails and answers. Plain TypeScript with no imports (Deno and Node).
// Exact decimal strings, never floating point.
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
