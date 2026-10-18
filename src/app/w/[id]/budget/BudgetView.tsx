"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, StatusChip } from "@/components/ui";
import { RatesNotice } from "@/components/RatesNotice";
import { RateBook, type RateRow } from "@/lib/rates.ts";
import { formatMinor } from "@/lib/money.ts";
import { CATEGORIES } from "@/lib/categories.ts";
import { budgetSummary, contributions, exposure, feesLost, type BudgetGroup, type Payment } from "@/lib/payments.ts";
import type { PersonOption } from "@/lib/money-data.ts";
import { BudgetSheet } from "./BudgetSheet";
import styles from "./budget.module.css";

type Props = {
  weddingId: string; home: string; names: string | null; payments: Payment[]; budgets: { category: string; amount_minor: number }[];
  people: PersonOption[]; rates: RateRow[]; today: string;
};

function Meter({ value, max, over }: { value: number; max: number; over: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value * 100) / max)) : value > 0 ? 100 : 0;
  return <div className={styles.meter} aria-hidden="true"><div className={over ? styles.over : undefined} style={{ width: `${pct}%` }} /></div>;
}

export function BudgetView({ weddingId, home, names, payments, budgets, people, rates, today }: Props) {
  const router = useRouter();
  const book = useMemo(() => new RateBook(rates), [rates]);
  const [sheet, setSheet] = useState<BudgetGroup | "new" | null>(null);
  const money = (m: number) => formatMinor(m, home, { whole: true });

  const s = budgetSummary(payments, budgets, home, book, today, CATEGORIES);
  const ex = exposure(payments, home, book, today);
  const lost = feesLost(payments, home, book);
  const contrib = contributions(payments, [
    { id: null, name: names || "The couple", currency: null },
    ...people.filter((m) => m.role === "family" || m.role === "planner").map((m) => ({ id: m.id, name: m.name, currency: m.payer_currency })),
  ], home, book, today);
  const overall = s.committed > s.budget;

  return (
    <>
      <h1 className="tn-title">Budget</h1>

      <section className={styles.headline}>
        <div className={styles.figure}>
          <b className="tn-figure">{money(s.committed)}</b>
          <span>{s.budget ? `of ${money(s.budget)} budget` : "committed"}</span>
        </div>
        {s.budget ? <Meter value={s.committed} max={s.budget} over={overall} /> : null}
        <p>
          {money(s.committed)} committed{s.budget ? ` of ${money(s.budget)}` : ""}{s.planned ? `, plus ${money(s.planned)} planned` : ""}.
          {s.budget ? (overall ? ` ${money(s.committed - s.budget)} over budget.` : ` ${money(s.budget - s.committed)} left to allocate.`) : ""}
        </p>
      </section>

      <section aria-labelledby="groups-h">
        <h2 id="groups-h" className="visually-hidden">Budget by part of the day</h2>
        {s.groups.length === 0 ? <p className="tn-muted">No budget yet. Add a line for each part of the day.</p> : null}
        {s.groups.map((g) => {
          const over = g.budget > 0 && g.committed > g.budget;
          const onlyPlanned = g.committed === 0 && g.planned > 0;
          return (
            <button key={g.name} type="button" className={styles.group} onClick={() => setSheet(g)} aria-label={`${g.name}: change budget`}>
              <span className={styles.groupTop}>
                <b>{g.name}</b>
                {onlyPlanned ? <StatusChip tone="estimate">Planned</StatusChip>
                  : over ? <span className={styles.overText}>{money(g.committed - g.budget)} over</span>
                  : g.budget ? <span className="tn-small tn-muted">{money(g.budget - g.committed)} left</span> : null}
              </span>
              <Meter value={g.committed} max={g.budget} over={over} />
              <span className="tn-small tn-muted">
                {money(g.committed)} committed{g.budget ? ` of ${money(g.budget)}` : ""}{g.planned ? ` · ${money(g.planned)} planned` : ""}
              </span>
            </button>
          );
        })}
      </section>
      <Button variant="secondary" block onClick={() => setSheet("new")}>Add a budget line</Button>

      <section aria-labelledby="fx-h" className="tn-stack">
        <h2 id="fx-h" className="tn-heading">Currency exposure</h2>
        {ex.rows.length ? (
          <>
            <p className="tn-small tn-muted">What you still owe abroad, worth today in {home}, and what a 5% move against you would add.</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th scope="col">Currency</th><th scope="col">Still owed</th><th scope="col">Worth today</th><th scope="col">If it moves 5%</th></tr></thead>
                <tbody>
                  {ex.rows.map((r) => (
                    <tr key={r.currency}><th scope="row">{r.currency}</th><td>{formatMinor(r.owed, r.currency, { whole: true })}</td><td>{money(r.worth)}</td><td>+{money(r.swing)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tn-small">A 5% move against you on everything still owed would add <b>{money(ex.swing)}</b>.</p>
            <RatesNotice compact />
          </>
        ) : <p className="tn-small tn-muted">You don&rsquo;t owe anything in another currency right now.</p>}
      </section>

      <section aria-labelledby="fees-h" className="tn-stack">
        <h2 id="fees-h" className="tn-heading">Money lost to fees and rates</h2>
        <p className="tn-small">
          {lost > 0
            ? <>You&rsquo;ve lost <b>{money(lost)}</b> to fees and exchange rates, compared with the mid-market rate on each day you paid.</>
            : "Nothing so far. Add the amount from your bank or card statement when you mark a payment as paid, and we'll show what fees and rates cost you."}
        </p>
      </section>

      {contrib.length ? (
        <section aria-labelledby="who-h" className="tn-stack">
          <h2 id="who-h" className="tn-heading">Who&rsquo;s paying</h2>
          <ul className={styles.who}>
            {contrib.map((c) => (
              <li key={c.id ?? "couple"}>
                <span>{c.name}</span>
                <span className={styles.amount}>{money(c.committed)}{c.inOwn !== null && c.currency ? <small>about {formatMinor(c.inOwn, c.currency, { whole: true })}</small> : null}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <BudgetSheet weddingId={weddingId} home={home} target={sheet} budgets={budgets} onClose={() => setSheet(null)} onDone={() => { setSheet(null); router.refresh(); }} />
    </>
  );
}
