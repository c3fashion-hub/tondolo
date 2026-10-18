import type { Payment } from "./payments.ts";

// The cash envelope plan (spec: "every payment due in cash or on the day, by date and currency, with
// who hands it over, totals per currency, and printable"). Envelopes are real payments still to pay
// in cash. Payments due on the day with no way of paying chosen yet are listed separately, to decide.

export type Envelope = { payment: Payment; when: string };
export type CashDay = { date: string; envelopes: Envelope[] };
export type CashPlan = {
  days: CashDay[];
  totals: { currency: string; minor: number }[];
  withdrawBy: string | null;   // two days before the first envelope, so there's time to find a cash machine
  undecided: Payment[];        // due on the wedding day with no method chosen
};

const WITHDRAW_DAYS_BEFORE = 2;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// "09:00", "16:30, after the ceremony", "End of the night": a time first if there is one, then the note.
export function whenLabel(p: Pick<Payment, "handover_time" | "handover_note">): string {
  const note = (p.handover_note ?? "").trim();
  if (p.handover_time) return note ? `${p.handover_time}, ${note}` : p.handover_time;
  return note ? note.charAt(0).toUpperCase() + note.slice(1) : "Time not set";
}

export function cashPlan(payments: Payment[], weddingDate: string): CashPlan {
  const unpaid = payments.filter((p) => !p.is_estimate && p.status !== "paid");
  const cash = unpaid.filter((p) => p.method === "cash");
  const byDate = new Map<string, Envelope[]>();
  for (const p of cash) {
    const date = p.due_on ?? weddingDate;
    byDate.set(date, [...(byDate.get(date) ?? []), { payment: p, when: whenLabel(p) }]);
  }
  // Within a day: timed envelopes in time order, then untimed ones in the order they were added.
  const days = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, envelopes]) => ({
    date,
    envelopes: envelopes.map((e, i) => ({ e, i })).sort((a, b) => {
      const ta = a.e.payment.handover_time ?? "99:99", tb = b.e.payment.handover_time ?? "99:99";
      return ta.localeCompare(tb) || a.i - b.i;
    }).map(({ e }) => e),
  }));
  const totals = new Map<string, number>();
  for (const p of cash) totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.amount_minor);
  return {
    days,
    totals: [...totals].map(([currency, minor]) => ({ currency, minor })),
    withdrawBy: days.length ? addDays(days[0].date, -WITHDRAW_DAYS_BEFORE) : null,
    undecided: unpaid.filter((p) => !p.method && p.due_on === weddingDate),
  };
}
