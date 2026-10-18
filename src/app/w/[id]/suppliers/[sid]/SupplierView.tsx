"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, PaymentRow, StatusChip, buttonClass } from "@/components/ui";
import { supplierStatus } from "@/components/health/SupplierList";
import { ConfirmSheet } from "@/components/protect/ConfirmSheet";
import { ConfirmedSheet } from "@/components/protect/ConfirmedSheet";
import { SupplierSheet } from "@/components/protect/SupplierSheet";
import { RateBook, type RateRow } from "@/lib/rates.ts";
import { formatMinor } from "@/lib/money.ts";
import { formatShortDate } from "@/lib/dates.ts";
import { homeValue, statusOf, METHOD_LABEL, type Payment } from "@/lib/payments.ts";
import { LANGUAGE_NAME, type PricePart } from "@/lib/messages.ts";
import { MUST_HAVES, contractGaps, inPlaceSummary, type BookingConfirmation, type SupplierProtection } from "@/lib/protection.ts";
import { ScanSheet } from "@/components/scan/ScanSheet";
import { openDocument } from "@/lib/scan-client.ts";
import type { DocumentRow } from "@/lib/money-data.ts";
import styles from "@/components/protect/protect.module.css";

export type SupplierViewProps = {
  weddingId: string; protection: SupplierProtection; payments: Payment[]; bookings: BookingConfirmation[];
  home: string; weddingDate: string; destination: string | null; today: string; rates: RateRow[]; preview?: boolean;
  documents: DocumentRow[]; suppliers: { id: string; name: string }[];
};

const KIND: Record<string, string> = { quote: "Quote", contract: "Contract", invoice: "Invoice", receipt: "Receipt", other: "Document" };

// What a booking costs and how the balance is paid, for the price point of the booking message.
function priceOf(payments: Payment[], weddingDate: string): PricePart | null {
  const real = payments.filter((p) => !p.is_estimate);
  if (!real.length || new Set(real.map((p) => p.currency)).size > 1) return null;
  const unpaid = real.filter((p) => p.status !== "paid");
  const sum = (ps: Payment[]) => ps.reduce((a, p) => a + p.amount_minor, 0);
  const dues = unpaid.map((p) => p.due_on).filter(Boolean).sort() as string[];
  return {
    total: sum(real), paid: sum(real.filter((p) => p.status === "paid")), balance: sum(unpaid), currency: real[0].currency,
    balanceInCash: unpaid.length > 0 && unpaid.every((p) => p.method === "cash"),
    balanceOnDay: unpaid.length > 0 && unpaid.every((p) => p.due_on === weddingDate),
    balanceDue: dues.length ? dues[dues.length - 1] : null,
  };
}

export function SupplierView(props: SupplierViewProps) {
  const { protection: s, home, today, weddingId } = props;
  const sup = s.supplier;
  const router = useRouter();
  const book = useMemo(() => new RateBook(props.rates), [props.rates]);
  const [sheet, setSheet] = useState<"confirm" | "confirmed" | "details" | "contract" | null>(null);
  const done = () => { setSheet(null); if (!props.preview) router.refresh(); };
  const st = supplierStatus(s, home);
  const base = `/w/${weddingId}`;
  const latest = [...props.bookings].reverse().find((b) => b.sent_on || b.confirmed_on) ?? null;
  const waiting = latest && !latest.confirmed_on ? latest : null;

  return (
    <>
      <Link href={`${base}/payments`} className="tn-back">‹ Payments</Link>
      <div className="tn-stack" style={{ gap: 6 }}>
        <span><StatusChip tone={st.tone}>{st.label}</StatusChip></span>
        <h1 className="tn-title">{sup.name}</h1>
        <p className="tn-muted" style={{ fontSize: 14 }}>Level {s.level} · {inPlaceSummary(s)}</p>
      </div>

      <section className={styles.card} aria-labelledby="prot-h">
        <h2 id="prot-h" className="tn-heading">What this booking needs</h2>
        {s.level === 1 ? (
          <>
            <p>Level 1: a contract with the Protection Kit&rsquo;s three must-haves, and the payments made furthest ahead on a protected method.</p>
            {s.contract ? (
              <ul className="tn-stack" style={{ margin: 0, paddingLeft: 18, gap: 4, fontSize: 14 }}>
                {MUST_HAVES.map((m) => {
                  const state = s.contract!.missing.includes(m.key) ? "Missing" : s.contract!.incomplete.includes(m.key) ? "Incomplete" : "In the contract";
                  return <li key={m.key}><b>{state}:</b> {m.label}</li>;
                })}
              </ul>
            ) : <p className="tn-muted">No contract checked yet.</p>}
            {s.contract && !s.inPlace ? <p>{contractGaps(s.contract)}. Ask {sup.name} to add {s.contract.missing.length + s.contract.incomplete.length === 1 ? "it" : "them"} before your next payment.</p> : null}
            <Button block variant={s.contract ? "secondary" : "primary"} onClick={() => setSheet("contract")}>
              {s.contract ? "Check a new version of the contract" : "Check the contract"}
            </Button>
          </>
        ) : (
          <>
            <p>{s.level === 2 ? "Level 2: a short contract, or a booking message they reply to confirm." : "Level 3: a booking message they reply \"Confirmed\" to."} Keep the deposit small and pay the balance after the service.</p>
            {latest?.confirmed_on ? (
              <p><b>Confirmed in writing on {formatShortDate(latest.confirmed_on)}.</b>{latest.reply_evidence ? ` "${latest.reply_evidence}"` : ""}</p>
            ) : waiting ? (
              <p>Message sent on {formatShortDate(waiting.sent_on!)}{waiting.language ? ` in ${LANGUAGE_NAME[waiting.language]}` : ""}. Waiting for their reply.</p>
            ) : null}
            <div className={styles.actions}>
              {!latest?.confirmed_on ? <Button block onClick={() => setSheet("confirm")}>{waiting ? "Send it again" : "Confirm the booking"}</Button> : null}
              {!latest?.confirmed_on ? <Button block variant="secondary" onClick={() => setSheet("confirmed")}>They&rsquo;ve confirmed</Button> : null}
              {latest?.confirmed_on ? <Button block variant="secondary" onClick={() => setSheet("confirm")}>Send a new booking message</Button> : null}
            </div>
          </>
        )}
      </section>

      <section className={styles.card} aria-labelledby="det-h">
        <h2 id="det-h" className="tn-heading">Details</h2>
        <dl className={styles.facts}>
          <dt>Contact</dt><dd>{sup.contact_name ?? "Not added"}</dd>
          <dt>Phone</dt><dd>{sup.phone ?? "Not added"}</dd>
          <dt>Email</dt><dd>{sup.email ?? "Not added"}</dd>
          {sup.legal_name ? <><dt>Legal name</dt><dd>{sup.legal_name}</dd></> : null}
          <dt>Messages in</dt><dd>{LANGUAGE_NAME[sup.language ?? "en"]}</dd>
        </dl>
        <Button variant="secondary" onClick={() => setSheet("details")}>Edit details</Button>
      </section>

      <section aria-labelledby="pay-h">
        <h2 id="pay-h" className="tn-heading">Payments</h2>
        {props.payments.filter((p) => !p.is_estimate).map((p) => {
          const stt = statusOf(p, today);
          const v = homeValue(p, home, book, today);
          return (
            <PaymentRow key={p.id} title={p.title} status={stt?.label} tone={stt?.tone}
              detail={p.status === "paid" ? `paid ${p.paid_on ? formatShortDate(p.paid_on) : ""}${p.method ? ` · ${METHOD_LABEL[p.method]}` : ""}` : p.due_on ? `due ${formatShortDate(p.due_on)}` : ""}
              amount={formatMinor(p.amount_minor, p.currency)}
              converted={p.currency !== home && v !== null ? `${formatMinor(v, home, { whole: true })} ${p.status === "paid" ? "locked" : "today"}` : undefined} />
          );
        })}
      </section>

      <section aria-labelledby="doc-h">
        <h2 id="doc-h" className="tn-heading">Documents</h2>
        {props.documents.length ? (
          <ul className={styles.docs}>
            {props.documents.map((d) => (
              <li key={d.id}>
                <span><b>{d.file_name}</b><span>{KIND[d.kind ?? "other"] ?? "Document"} · added {formatShortDate(d.created_at.slice(0, 10))}{d.confirmed_at ? "" : " · not checked yet"}</span></span>
                <Button size="sm" variant="secondary" onClick={() => openDocument(d.file_path)} aria-label={`Open ${d.file_name}`}>Open</Button>
              </li>
            ))}
          </ul>
        ) : <p className="tn-muted" style={{ margin: "8px 0 0" }}>Quotes, invoices and contracts you scan for {sup.name} appear here.</p>}
      </section>

      <section className={styles.card} aria-labelledby="claim-h">
        <h2 id="claim-h" className="tn-heading">If something goes wrong</h2>
        <p>The claim pack puts the booking, every payment, what the contract says, the booking confirmation, a dated timeline and your documents in one PDF, ready for your card company, insurer or a consumer body.</p>
        <a href={`${base}/suppliers/${sup.id}/claim-pack`} className={buttonClass({ variant: "secondary", block: true })} download>Download the claim pack (PDF)</a>
      </section>

      {sheet === "confirm" && s.level !== 1 ? (
        <ConfirmSheet weddingId={weddingId} supplier={sup} level={s.level} weddingDate={props.weddingDate} place={props.destination ?? ""}
          today={today} price={priceOf(props.payments, props.weddingDate)} preview={props.preview} onClose={() => setSheet(null)} onSent={done} />
      ) : null}
      <ConfirmedSheet open={sheet === "confirmed"} weddingId={weddingId} supplier={sup} booking={waiting} today={today} onClose={() => setSheet(null)} onDone={done} />
      {sheet === "contract" ? (
        <ScanSheet open mode="contract" weddingId={weddingId} destination={props.destination} today={today} suppliers={props.suppliers}
          supplierName={sup.name} onClose={() => setSheet(null)} onDone={done} />
      ) : null}
      {sheet === "details" ? <SupplierSheet open supplier={sup} onClose={() => setSheet(null)} onDone={done} /> : null}
    </>
  );
}
