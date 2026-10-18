import Link from "next/link";
import { OverviewBand, PaymentRow, buttonClass } from "@/components/ui";
import { HealthRing } from "@/components/health/HealthRing";
import { RateBook, type RateRow } from "@/lib/rates.ts";
import { formatMinor } from "@/lib/money.ts";
import { daysBetween, formatShortDate } from "@/lib/dates.ts";
import { budgetSummary, exposure, feesLost, homeValue, statusOf, totals, type Payment } from "@/lib/payments.ts";
import { CATEGORIES } from "@/lib/categories.ts";
import { healthCheck } from "@/lib/health.ts";
import { contractGaps, type BookingConfirmation, type ContractCheck, type Supplier } from "@/lib/protection.ts";
import shell from "./shell.module.css";
import styles from "@/components/health/health.module.css";

export type OverviewProps = {
  weddingId: string; names: string | null; destination: string | null; weddingDate: string; home: string; today: string;
  payments: Payment[]; budgets: { category: string; amount_minor: number }[]; suppliers: Supplier[];
  checks: ContractCheck[]; bookings: BookingConfirmation[]; rates: RateRow[]; couple: boolean;
};

const SOON_DAYS = 14;

// The couple's and planner's Overview: days to go, totals, what needs attention, a one-line summary
// linking to Budget and the health check, in the design's order. Before the first payment it's the First open screen.
export function OverviewView(props: OverviewProps) {
  const { weddingId, home, today, payments, weddingDate } = props;
  const base = `/w/${weddingId}`;
  const book = new RateBook(props.rates);
  const money = (m: number) => formatMinor(m, home, { whole: true });
  const days = daysBetween(today, weddingDate);
  const place = [props.names, props.destination, formatShortDate(weddingDate)].filter(Boolean).join(" · ");
  const t = totals(payments, home, book, today);
  const real = payments.filter((p) => !p.is_estimate);
  const health = healthCheck({ ...props, destination: props.destination, book });

  const band = (
    <OverviewBand
      days={days >= 0 ? days : null}
      daysLabel={days > 1 || days === 0 ? "days to go" : days === 1 ? "day to go" : "Married!"}
      place={place}
      committed={real.length ? money(t.committed) : undefined}
      paid={real.length ? money(t.paid) : undefined}
      toPay={real.length ? money(t.toPay) : undefined}
    />
  );

  if (!real.length || !health) {
    return (
      <>
        {band}
        <section className={shell.card}>
          <h1 className="tn-heading" style={{ fontSize: 22, lineHeight: "28px" }}>Add your first payment</h1>
          <p className="tn-muted">Start with the one that worries you most, usually the venue. A photo of the quote or invoice is enough.</p>
          <Link href={`${base}/payments?scan=1`} className={buttonClass({ block: true })}>Scan a quote or invoice</Link>
          <Link href={`${base}/payments`} className={buttonClass({ variant: "secondary", block: true })}>Add it by hand</Link>
        </section>
        {props.couple ? (
          <section className="tn-stack" style={{ gap: 10 }}>
            <h2 className="tn-heading">Your first week</h2>
            <ol className={shell.steps}>
              <li><span className={`${shell.num} ${shell.numNext}`}>1</span>Add your venue and planner payments</li>
              <li><span className={shell.num}>2</span><Link href={`${base}/settings#people`}>Invite your partner to see it too</Link></li>
              <li><span className={shell.num}>3</span><Link href={`${base}/settings#checkin`}>Pick a weekly check-in time</Link></li>
            </ol>
          </section>
        ) : null}
      </>
    );
  }

  // Needs your attention: overdue first, then anything due in the next two weeks, then money at risk.
  const supplierName = (p: Payment) => props.suppliers.find((s) => s.id === p.supplier_id)?.name;
  const unpaid = real.filter((p) => p.status !== "paid" && p.due_on && daysBetween(today, p.due_on) <= SOON_DAYS)
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!));
  const atRisk = health.suppliers.filter((s) => s.atRisk > 0).sort((a, b) => b.atRisk - a.atRisk);
  const rows = [
    ...unpaid.map((p) => {
      const s = statusOf(p, today)!;
      const v = homeValue(p, home, book, today);
      return (
        <PaymentRow key={p.id} title={p.title} status={s.label} tone={s.tone}
          detail={[supplierName(p) ?? p.category, `due ${formatShortDate(p.due_on!)}`].filter(Boolean).join(", ")}
          amount={formatMinor(p.amount_minor, p.currency)}
          converted={p.currency !== home && v !== null ? `${money(v)} today` : undefined} />
      );
    }),
    ...atRisk.map((s) => (
      <PaymentRow key={s.supplier.id} title={s.supplier.name} status={`${money(s.atRisk)} at risk`} tone="risk"
        detail={s.contract && (s.contract.missing.length || s.contract.incomplete.length)
          ? `${contractGaps(s.contract)}. Fix it before your next payment.`
          : s.level === 1 ? "Contract not checked yet. Check it before your next payment." : "Booking not confirmed yet."}
        amount={`${s.paidInCurrency.map((c) => formatMinor(c.minor, c.currency, { whole: true })).join(" + ")} paid`}
        converted={s.paidInCurrency.some((c) => c.currency !== home) ? money(s.atRisk) : undefined}>
        <Link href={`${base}/health`} className={buttonClass({ variant: "secondary", size: "sm" })}>See what to do</Link>
      </PaymentRow>
    )),
  ].slice(0, 4);

  // The one-line summary card for Budget.
  const budget = budgetSummary(payments, props.budgets, home, book, today, CATEGORIES).budget;
  const swing = exposure(payments, home, book, today).swing;
  const fees = feesLost(payments, home, book);
  const extra = [swing ? `A 5% rate move would add ${money(swing)}.` : null, fees ? `${money(fees)} lost to fees.` : null].filter(Boolean).join(" ");

  return (
    <>
      {band}
      <section aria-labelledby="att-h" className={styles.attention}>
        <h2 id="att-h" className="tn-heading">Needs your attention</h2>
        {rows.length ? rows : <p className="tn-muted" style={{ margin: "8px 0 0" }}>Nothing needs you in the next two weeks.</p>}
      </section>

      <Link href={`${base}/budget`} className={`${styles.card} ${styles.summary}`}>
        <span className={styles.cardText}>
          <b>{budget ? `${money(t.committed)} of ${money(budget)} committed` : `${money(t.committed)} committed`}</b>
          {extra ? <span>{extra}</span> : null}
        </span>
        <span className={styles.cardLink}>See budget</span>
      </Link>
      <Link href={`${base}/health`} className={styles.card}>
        <HealthRing score={health.score} />
        <span className={styles.cardText}>
          <b>Money health check: {health.score} of 100</b>
          <span>{health.band}. {health.issues.length
            ? health.issues.length > 1 ? `Fix the first two and you'll be at ${health.fixFirstTwo}.` : `Fix it and you'll be at ${health.fixFirstTwo}.`
            : "Nothing to fix right now."}</span>
        </span>
      </Link>

    </>
  );
}
