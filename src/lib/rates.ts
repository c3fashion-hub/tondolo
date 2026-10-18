import { currency } from "./currencies.ts";

// One stored rate: how many units of `currency` one pound buys on `on_date`.
export type RateRow = { on_date: string; currency: string; per_gbp: string | number };

const SCALE = 10n ** 10n; // rates are stored with 10 decimal places

function toScaled(value: string | number): bigint {
  const s = typeof value === "number" ? value.toFixed(10) : value.trim();
  const m = /^(\d+)(?:\.(\d{0,10})\d*)?$/.exec(s);
  if (!m) throw new Error(`Bad rate ${value}`);
  return BigInt(m[1]) * SCALE + BigInt((m[2] ?? "").padEnd(10, "0"));
}

// Looks up rates the same way the database does: the day's rate, else the latest before it,
// else the earliest stored.
export class RateBook {
  private byCurrency = new Map<string, { date: string; rate: bigint }[]>();

  constructor(rows: RateRow[]) {
    for (const r of rows) {
      const list = this.byCurrency.get(r.currency) ?? [];
      list.push({ date: r.on_date, rate: toScaled(r.per_gbp) });
      this.byCurrency.set(r.currency, list);
    }
    for (const list of this.byCurrency.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  }

  perGbp(code: string, date: string): bigint | null {
    if (code === "GBP") return SCALE;
    const list = this.byCurrency.get(code);
    if (!list?.length) return null;
    let found: bigint | null = null;
    for (const r of list) {
      if (r.date <= date) found = r.rate;
      else break;
    }
    return found ?? list[0].rate;
  }

  latestDate(): string | null {
    let latest: string | null = null;
    for (const list of this.byCurrency.values()) {
      const d = list[list.length - 1]?.date;
      if (d && (!latest || d > latest)) latest = d;
    }
    return latest;
  }

  // Minor units in `from` to minor units in `to`, rounding half up. Matches public.convert_minor.
  convert(amountMinor: number, from: string, to: string, date: string): number | null {
    if (from === to) return amountMinor;
    const pf = this.perGbp(from, date);
    const pt = this.perGbp(to, date);
    const cf = currency(from);
    const ct = currency(to);
    if (pf === null || pt === null || !cf || !ct) return null;
    const num = BigInt(amountMinor) * 10n ** BigInt(ct.minor) * pt;
    const den = pf * 10n ** BigInt(cf.minor);
    const q = num / den;
    const r = num % den;
    return Number(r * 2n >= den ? q + 1n : q);
  }

  // Home-currency units for one unit of `from`, for showing "1 EUR = 0.8439 GBP".
  unitRate(from: string, to: string, date: string): number | null {
    const pf = this.perGbp(from, date);
    const pt = this.perGbp(to, date);
    if (pf === null || pt === null) return null;
    return Number((pt * 1_000_000n) / pf) / 1_000_000;
  }
}
