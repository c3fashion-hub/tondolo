import type { Metadata } from "next";
import Link from "next/link";
import { OverviewBand, buttonClass } from "@/components/ui";
import { loadWedding } from "@/lib/wedding.ts";
import { can } from "@/lib/roles.ts";
import { daysBetween, formatShortDate, todayIn } from "@/lib/dates.ts";
import styles from "./shell.module.css";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { wedding, me } = await loadWedding(id);
  const days = daysBetween(todayIn(), wedding.wedding_date);
  const place = [wedding.names, wedding.destination, formatShortDate(wedding.wedding_date)].filter(Boolean).join(" · ");
  const couple = can(me.role).managePeople;

  return (
    <>
      <OverviewBand
        days={days >= 0 ? days : null}
        daysLabel={days > 1 || days === 0 ? "days to go" : days === 1 ? "day to go" : "Married!"}
        place={place}
      />
      <section className={styles.card}>
        <h1 className="tn-heading" style={{ fontSize: 22, lineHeight: "28px" }}>Add your first payment</h1>
        <p className="tn-muted">Start with the one that worries you most, usually the venue. A photo of the quote or invoice is enough.</p>
        <Link href={`/w/${id}/payments`} className={buttonClass({ block: true })}>Scan a quote or invoice</Link>
        <Link href={`/w/${id}/payments`} className={buttonClass({ variant: "secondary", block: true })}>Add it by hand</Link>
      </section>
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
