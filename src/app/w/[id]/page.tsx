import type { Metadata } from "next";
import Link from "next/link";
import { OverviewBand, buttonClass } from "@/components/ui";
import { loadMoney } from "@/lib/money-data.ts";
import { RateBook } from "@/lib/rates.ts";
import { homeValue } from "@/lib/payments.ts";
import { formatMinor } from "@/lib/money.ts";
import { can } from "@/lib/roles.ts";
import { daysBetween, formatShortDate, todayIn } from "@/lib/dates.ts";
import { OverviewView } from "./OverviewView";
import styles from "./shell.module.css";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadMoney(id);
  const { supabase, wedding, me, payments, rates } = data;
  const today = todayIn();
  const home = wedding.home_currency;

  if (me.role !== "family") {
    return (
      <OverviewView weddingId={id} names={wedding.names} destination={wedding.destination} weddingDate={wedding.wedding_date}
        home={home} today={today} payments={payments} budgets={data.budgets} suppliers={data.suppliers}
        checks={data.checks} bookings={data.bookings} rates={rates} couple={can(me.role).managePeople} unlocked={wedding.unlocked_at !== null} />
    );
  }

  // Family see overall progress from the database's totals and their own payments, nothing else.
  const money = (m: number) => formatMinor(m, home, { whole: true });
  const book = new RateBook(rates);
  const days = daysBetween(today, wedding.wedding_date);
  const { data: progress } = await supabase.rpc("wedding_progress", { w: id });
  const committed = Number(progress?.[0]?.committed ?? 0);
  const paid = Number(progress?.[0]?.paid ?? 0);
  const mine = payments.filter((p) => !p.is_estimate).reduce((a, p) => a + (homeValue(p, home, book, today) ?? 0), 0);
  const place = [wedding.names, wedding.destination, formatShortDate(wedding.wedding_date)].filter(Boolean).join(" · ");
  return (
    <>
      <OverviewBand
        days={days >= 0 ? days : null}
        daysLabel={days > 1 || days === 0 ? "days to go" : days === 1 ? "day to go" : "Married!"}
        place={place}
        committed={committed > 0 ? money(committed) : undefined}
        paid={committed > 0 ? money(paid) : undefined}
        toPay={committed > 0 ? money(committed - paid) : undefined}
      />
      <section className={styles.card}>
        <h1 className="tn-heading">Your contribution</h1>
        <p><b>{money(mine)}</b> across the payments you&rsquo;re covering.</p>
        <Link href={`/w/${id}/payments`} className={buttonClass({ variant: "secondary", block: true })}>See your payments</Link>
      </section>
    </>
  );
}
