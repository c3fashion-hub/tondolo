import type { Metadata } from "next";
import Link from "next/link";
import { OverviewBand, buttonClass } from "@/components/ui";
import { loadMoney } from "@/lib/money-data.ts";
import { RateBook } from "@/lib/rates.ts";
import { totals, homeValue } from "@/lib/payments.ts";
import { formatMinor } from "@/lib/money.ts";
import { can } from "@/lib/roles.ts";
import { daysBetween, formatShortDate, todayIn } from "@/lib/dates.ts";
import styles from "./shell.module.css";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, wedding, me, payments, rates } = await loadMoney(id);
  const today = todayIn();
  const days = daysBetween(today, wedding.wedding_date);
  const home = wedding.home_currency;
  const money = (m: number) => formatMinor(m, home, { whole: true });
  const book = new RateBook(rates);
  const family = me.role === "family";
  // Family see overall progress from the database's totals; their own payments are all they can see.
  let committed: number, paid: number;
  if (family) {
    const { data } = await supabase.rpc("wedding_progress", { w: id });
    committed = Number(data?.[0]?.committed ?? 0); paid = Number(data?.[0]?.paid ?? 0);
  } else {
    const t = totals(payments, home, book, today);
    committed = t.committed; paid = t.paid;
  }
  const mine = family ? payments.filter((p) => !p.is_estimate).reduce((a, p) => a + (homeValue(p, home, book, today) ?? 0), 0) : 0;
  const hasPayments = committed > 0 || payments.some((p) => !p.is_estimate);
  const place = [wedding.names, wedding.destination, formatShortDate(wedding.wedding_date)].filter(Boolean).join(" · ");
  const couple = can(me.role).managePeople;

  return (
    <>
      <OverviewBand
        days={days >= 0 ? days : null}
        daysLabel={days > 1 || days === 0 ? "days to go" : days === 1 ? "day to go" : "Married!"}
        place={place}
        committed={hasPayments ? money(committed) : undefined}
        paid={hasPayments ? money(paid) : undefined}
        toPay={hasPayments ? money(committed - paid) : undefined}
      />
      {family ? (
        <section className={styles.card}>
          <h1 className="tn-heading">Your contribution</h1>
          <p><b>{money(mine)}</b> across the payments you&rsquo;re covering.</p>
          <Link href={`/w/${id}/payments`} className={buttonClass({ variant: "secondary", block: true })}>See your payments</Link>
        </section>
      ) : null}
      {!family && !hasPayments ? <section className={styles.card}>
        <h1 className="tn-heading" style={{ fontSize: 22, lineHeight: "28px" }}>Add your first payment</h1>
        <p className="tn-muted">Start with the one that worries you most, usually the venue. A photo of the quote or invoice is enough.</p>
        <Link href={`/w/${id}/payments`} className={buttonClass({ block: true })}>Scan a quote or invoice</Link>
        <Link href={`/w/${id}/payments`} className={buttonClass({ variant: "secondary", block: true })}>Add it by hand</Link>
      </section> : null}
      {couple ? (
        <section className="tn-stack" style={{ gap: 10 }}>
          <h2 className="tn-heading">Your first week</h2>
          <ol className={styles.steps}>
            <li><span className={`${styles.num} ${styles.numNext}`}>1</span>Add your venue and planner payments</li>
            <li><span className={styles.num}>2</span><Link href={`/w/${id}/settings#people`}>Invite your partner to see it too</Link></li>
            <li><span className={styles.num}>3</span>Pick a weekly check-in time</li>
          </ol>
        </section>
      ) : null}
    </>
  );
}
