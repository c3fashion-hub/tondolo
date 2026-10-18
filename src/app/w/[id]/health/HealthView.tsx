import Link from "next/link";
import { StatusChip, buttonClass } from "@/components/ui";
import { HealthRing } from "@/components/health/HealthRing";
import { SupplierList } from "@/components/health/SupplierList";
import { RateBook, type RateRow } from "@/lib/rates.ts";
import { formatMinor } from "@/lib/money.ts";
import { healthCheck } from "@/lib/health.ts";
import type { Payment } from "@/lib/payments.ts";
import type { BookingConfirmation, ContractCheck, Supplier } from "@/lib/protection.ts";
import styles from "@/components/health/health.module.css";

export type HealthProps = {
  weddingId: string; destination: string | null; weddingDate: string; home: string; today: string;
  payments: Payment[]; budgets: { category: string; amount_minor: number }[]; suppliers: Supplier[];
  checks: ContractCheck[]; bookings: BookingConfirmation[]; rates: RateRow[];
};

export function HealthView(props: HealthProps) {
  const base = `/w/${props.weddingId}`;
  const money = (m: number) => formatMinor(m, props.home, { whole: true });
  const h = healthCheck({ ...props, book: new RateBook(props.rates) });
  const back = <Link href={base} className="tn-back">‹ Overview</Link>;

  if (!h) {
    return (
      <>
        {back}
        <h1 className="tn-title">Money health check</h1>
        <p className="tn-muted" style={{ margin: 0 }}>Add your first payment to see your score.</p>
        <Link href={`${base}/payments`} className={buttonClass({ block: true })}>Add a payment</Link>
      </>
    );
  }

  return (
    <>
      {back}
      <div className={styles.head}>
        <HealthRing score={h.score} size={96} />
        <div>
          <h1 className="tn-title">Money health check</h1>
          <p><b>{h.score} of 100: {h.band}.</b>{" "}
            {h.issues.length > 1 ? `Fix the first two and you'll be at ${h.fixFirstTwo}.` : h.issues.length ? `Fix it and you'll be at ${h.fixFirstTwo}.` : "Nothing to fix right now."}</p>
        </div>
      </div>

      {h.issues.length ? (
        <section aria-labelledby="fix-h">
          <h2 id="fix-h" className="visually-hidden">Things to fix</h2>
          <ol className={styles.issues}>
            {h.issues.map((i) => (
              <li key={i.id} className={styles.issue}>
                <StatusChip tone={i.chip.tone}>{i.chip.label}</StatusChip>
                <h3>{i.title}</h3>
                <p>{i.body}</p>
                <span className={styles.points}>{i.points ? `${i.points} ${i.points === 1 ? "point" : "points"} off your score` : "No points off: the limit for this kind of issue is reached"}</span>
                {i.action ? <Link href={`${base}/${i.action.href}`} className={buttonClass({ variant: "secondary", size: "sm" })}>{i.action.label}</Link> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {h.paid > 0 ? (
        <section className={styles.issue} aria-labelledby="well-h">
          <StatusChip tone="paid">Going well</StatusChip>
          <h2 id="well-h">{money(h.covered)} of {money(h.paid)} paid is covered</h2>
          <p>By a card payment or the protections each supplier&rsquo;s level needs.</p>
        </section>
      ) : null}

      {h.suppliers.length ? (
        <section aria-labelledby="sup-h">
          <h2 id="sup-h" className="tn-heading">Your suppliers</h2>
          <p className="tn-small tn-muted" style={{ margin: "4px 0 0" }}>
            Level 1 needs a contract with the three must-haves. Level 2 needs a short contract or a confirmed booking. Level 3 needs a booking message they reply &ldquo;Confirmed&rdquo; to.
          </p>
          <SupplierList suppliers={h.suppliers} home={props.home} base={base} />
        </section>
      ) : null}

      <p className="tn-small tn-muted" style={{ margin: 0 }}>General information, not legal or financial advice. Check with your card provider, bank or a professional.</p>
    </>
  );
}
