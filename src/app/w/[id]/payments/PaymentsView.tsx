"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, PaymentRow } from "@/components/ui";
import { RatesNotice } from "@/components/RatesNotice";
import { RateBook, type RateRow } from "@/lib/rates.ts";
import { formatMinor } from "@/lib/money.ts";
import { formatShortDate } from "@/lib/dates.ts";
import { homeValue, statusOf, METHOD_LABEL, type Payment } from "@/lib/payments.ts";
import type { PersonOption } from "@/lib/money-data.ts";
import type { Role } from "@/lib/roles.ts";
import { protectionFor, type BookingConfirmation, type ContractCheck } from "@/lib/protection.ts";
import { SupplierList } from "@/components/health/SupplierList";
import { PaySafelySheet } from "@/components/protect/PaySafelySheet";
import { contractGaps, type Supplier } from "@/lib/protection.ts";
import { languageFor } from "@/lib/messages.ts";
import { cashPlan } from "@/lib/cash.ts";
import Link from "next/link";
import { PaymentSheet } from "./PaymentSheet";
import { PaidSheet } from "./PaidSheet";
import styles from "./payments.module.css";

export type ViewProps = {
  weddingId: string; home: string; unlocked: boolean; payments: Payment[]; people: PersonOption[];
  suppliers: Supplier[]; rates: RateRow[]; me: { id: string; role: Role }; seeAll: boolean; today: string;
  weddingDate: string; destination: string | null; checks: ContractCheck[]; bookings: BookingConfirmation[];
};

export const FREE_LIMIT = 5;

export function PaymentsView(props: ViewProps) {
  const { payments, home, today, people, unlocked } = props;
  const router = useRouter();
  const book = useMemo(() => new RateBook(props.rates), [props.rates]);
  const [editing, setEditing] = useState<Payment | "new" | null>(null);
  const [paying, setPaying] = useState<Payment | null>(null);
  const [safely, setSafely] = useState<Payment | null>(null);
  const done = () => { setEditing(null); setPaying(null); setSafely(null); router.refresh(); };

  const real = payments.filter((p) => !p.is_estimate);
  const upcoming = real.filter((p) => p.status === "due").sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"));
  const planned = payments.filter((p) => p.is_estimate).sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"));
  const paid = real.filter((p) => p.status === "paid").sort((a, b) => (b.paid_on ?? "").localeCompare(a.paid_on ?? ""));
  const protections = props.seeAll
    ? props.suppliers.map((s) => protectionFor(s, payments, props.checks, props.bookings, props.weddingDate, home, book, today)).filter((s) => s.committed > 0)
    : [];
  const cash = props.seeAll ? cashPlan(payments, props.weddingDate) : null;
  const supplierOf = (p: Payment) => props.suppliers.find((s) => s.id === p.supplier_id) ?? null;
  const protectionOf = (p: Payment) => protections.find((s) => s.supplier.id === p.supplier_id) ?? null;
  const nameOf = (id: string | null) => (id ? people.find((m) => m.id === id)?.name : null);

  function row(p: Payment) {
    const s = statusOf(p, today);
    const v = homeValue(p, home, book, today);
    const converted = p.currency === home ? undefined
      : v === null ? (p.status === "paid" ? "rate on the day paid coming soon" : "rate coming soon")
      : `${formatMinor(v, home, { whole: true })} ${p.status === "paid" ? "locked" : "today"}`;
    const when = p.status === "paid"
      ? `paid ${p.paid_on ? formatShortDate(p.paid_on) : ""}${p.method ? ` · ${METHOD_LABEL[p.method]}` : ""}`
      : p.due_on ? `due ${formatShortDate(p.due_on)}` : "";
    const payer = nameOf(p.paying_member_id);
    const detail = [p.category, when, payer ? `${payer} is paying` : null].filter(Boolean).join(", ");
    return (
      <PaymentRow key={p.id} title={p.title} detail={detail} status={s?.label} tone={s?.tone}
        amount={formatMinor(p.amount_minor, p.currency)} converted={converted}>
        {p.status === "due" && !p.is_estimate ? (
          <Button size="sm" onClick={() => setSafely(p)} aria-label={`Pay this safely: ${p.title}`}>Pay this safely</Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => setEditing(p)} aria-label={`${p.is_estimate ? "Replace with a real quote" : "Edit"}: ${p.title}`}>
          {p.is_estimate ? "Replace with a real quote" : "Edit"}
        </Button>
        {p.status === "due" && !p.is_estimate ? (
          <Button variant="secondary" size="sm" onClick={() => setPaying(p)} aria-label={`Mark as paid: ${p.title}`}>Mark as paid</Button>
        ) : null}
      </PaymentRow>
    );
  }

  return (
    <>
      <h1 className="tn-title">Payments</h1>
      <RatesNotice />
      <section className={styles.panel}>
        <p><b>Add each deposit, instalment and balance</b> as its own payment, in the currency the supplier charges.</p>
        <Button onClick={() => setEditing("new")} block>Add a payment</Button>
        {!unlocked ? (
          <p className="tn-small tn-muted">Free start: {Math.min(real.length, FREE_LIMIT)} of {FREE_LIMIT} payments added. Scanning quotes and invoices comes soon.</p>
        ) : null}
      </section>

      {protections.length ? (
        <section aria-labelledby="sup-h">
          <h2 id="sup-h" className="tn-heading">Your suppliers</h2>
          <SupplierList suppliers={protections} home={home} base={`/w/${props.weddingId}`} />
        </section>
      ) : null}

      {cash && cash.totals.length ? (
        <Link href={`/w/${props.weddingId}/cash`} className={styles.cashLink}>
          <span><b>Cash for the day</b><span>{cash.totals.map((t) => formatMinor(t.minor, t.currency)).join(" + ")} in {cash.days.reduce((a, d) => a + d.envelopes.length, 0)} envelopes</span></span>
          <span aria-hidden="true">›</span>
        </Link>
      ) : null}

      <section aria-labelledby="up-h">
        <h2 id="up-h" className="tn-heading">Coming up</h2>
        {upcoming.length ? upcoming.map(row) : <p className={styles.empty}>Nothing to pay yet. Add your next deposit or balance.</p>}
      </section>

      {planned.length ? (
        <section aria-labelledby="plan-h">
          <h2 id="plan-h" className="tn-heading">Planned from your starter budget</h2>
          <p className="tn-small tn-muted">Estimates to help you plan, not quotes. They don&rsquo;t count as committed until you replace them with a real figure.</p>
          {planned.map(row)}
        </section>
      ) : null}

      <section aria-labelledby="paid-h">
        <h2 id="paid-h" className="tn-heading">Paid</h2>
        {paid.length ? paid.map(row) : <p className={styles.empty}>Payments you mark as paid appear here, locked at the rate you paid.</p>}
      </section>

      <PaymentSheet {...props} book={book} payment={editing} onClose={() => setEditing(null)} onDone={done} />
      <PaySafelySheet
        input={safely ? {
          payment: safely, home, destination: props.destination, supplierName: supplierOf(safely)?.name ?? null,
          itemHome: protectionOf(safely)?.committed ?? homeValue(safely, home, book, today),
          contractGaps: (() => { const pr = protectionOf(safely); return pr && pr.level === 1 && pr.contract && !pr.inPlace ? contractGaps(pr.contract) : null; })(),
        } : null}
        language={(safely && supplierOf(safely)?.language) || languageFor(props.destination)}
        contactName={(safely && (supplierOf(safely)?.contact_name ?? null)) || null}
        converted={safely && safely.currency !== home ? (() => { const v = homeValue(safely, home, book, today); return v === null ? null : `About ${formatMinor(v, home, { whole: true })} today`; })() : null}
        onClose={() => setSafely(null)}
        onPaid={() => { const p = safely; setSafely(null); setPaying(p); }}
      />
      <PaidSheet weddingHome={home} book={book} payment={paying} today={today} onClose={() => setPaying(null)} onDone={done} />
    </>
  );
}
