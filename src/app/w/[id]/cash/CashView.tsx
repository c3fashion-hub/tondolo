"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { RateBook, type RateRow } from "@/lib/rates.ts";
import { formatMinor } from "@/lib/money.ts";
import { formatLongDate, formatShortDate } from "@/lib/dates.ts";
import { cashPlan } from "@/lib/cash.ts";
import { currencyWords } from "@/lib/pay-safely.ts";
import type { Payment } from "@/lib/payments.ts";
import styles from "@/components/protect/protect.module.css";

export type CashProps = { weddingId: string; payments: Payment[]; home: string; weddingDate: string; destination: string | null; today: string; rates: RateRow[]; preview?: boolean };

// Cash for the day: every payment to be made in cash, envelope by envelope, with who hands it over.
export function CashView(props: CashProps) {
  const { home, today } = props;
  const router = useRouter();
  const book = useMemo(() => new RateBook(props.rates), [props.rates]);
  const plan = cashPlan(props.payments, props.weddingDate);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [shared, setShared] = useState("");
  const inHome = (minor: number, cur: string) => {
    if (cur === home) return null;
    const v = book.convert(minor, cur, home, today);
    return v === null ? null : `${formatMinor(v, home, { whole: true })} today`;
  };
  const byLine = (p: Payment) => (p.handover_by ? `${p.handover_by} hands over` : null);
  const multiDay = plan.days.length > 1;
  const locals = plan.totals.map((t) => currencyWords(t.currency)).join(" and ");
  let n = 0;

  async function share() {
    const lines = plan.days.flatMap((d) => [
      ...(multiDay ? [formatLongDate(d.date)] : []),
      ...d.envelopes.map((e) => `${formatMinor(e.payment.amount_minor, e.payment.currency)}: ${e.payment.title} (${[e.when, byLine(e.payment)].filter(Boolean).join(", ")})`),
    ]);
    const text = [`Cash for the day: ${plan.totals.map((t) => formatMinor(t.minor, t.currency)).join(" + ")}`, ...lines].join("\n");
    try {
      if (navigator.share) { await navigator.share({ title: "Cash for the day", text }); setShared(""); }
      else { await navigator.clipboard.writeText(text); setShared("Copied. Paste it into a message to your helpers."); }
    } catch { /* the person closed the share sheet */ }
  }

  return (
    <>
      <Link href={`/w/${props.weddingId}/payments`} className="tn-back">‹ Payments</Link>
      <div className="tn-stack" style={{ gap: 4 }}>
        <h1 className="tn-title">Cash for the day</h1>
        <p className="tn-muted" style={{ fontSize: 14 }}>Everyone you&rsquo;ll pay in cash, envelope by envelope.</p>
      </div>

      {plan.days.length ? (
        <>
          <section className={styles.total} aria-label="Total to withdraw">
            <div>
              <small>Total to withdraw</small>
              {plan.totals.map((t) => <b key={t.currency} style={{ display: "block" }}>{formatMinor(t.minor, t.currency)}</b>)}
              {plan.totals.map((t) => { const h = inHome(t.minor, t.currency); return h ? <small key={`h-${t.currency}`}>{h}</small> : null; })}
            </div>
            {plan.withdrawBy ? <div className={styles.right}><small>Withdraw by</small><b>{formatShortDate(plan.withdrawBy)}</b></div> : null}
          </section>

          {plan.days.map((d) => (
            <section key={d.date} aria-label={formatLongDate(d.date)}>
              {multiDay ? <h2 className="tn-heading">{formatLongDate(d.date)}</h2> : null}
              <ol className={styles.envelopes}>
                {d.envelopes.map((e) => {
                  n += 1;
                  const p = e.payment;
                  return (
                    <li key={p.id} className={styles.envelope}>
                      <span className={styles.num} aria-hidden="true">{n}</span>
                      <span className={styles.envMain}>
                        <b>{p.title}</b>
                        <span>{[e.when, byLine(p)].filter(Boolean).join(" · ")}</span>
                        <button type="button" className={styles.linkBtn} onClick={() => setEditing(p)} aria-label={`When and who: ${p.title}`}>
                          {p.handover_by ? "Change when or who" : "Add who hands it over"}
                        </button>
                      </span>
                      <span className={styles.envAmount}>{formatMinor(p.amount_minor, p.currency)}{inHome(p.amount_minor, p.currency) ? <small>{inHome(p.amount_minor, p.currency)}</small> : null}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          <p className={styles.tip}>
            Withdraw in {locals} from a local bank&rsquo;s machine, and say no if it offers to charge you in {currencyWords(home)}. Withdraw fewer, larger amounts within your daily limit. Ask each person to sign or message a receipt.
          </p>
          <div className={styles.row}>
            <Button block onClick={share}>Share with helpers</Button>
            <Button block variant="secondary" onClick={() => window.print()}>Print envelopes</Button>
          </div>
          <p className="tn-small tn-muted" role="status" style={{ margin: 0 }}>{shared}</p>

          <div className={styles.printOnly} aria-hidden="true">
            {plan.days.flatMap((d) => d.envelopes).map((e) => (
              <div key={e.payment.id} className={styles.printEnvelope}>
                <b>{e.payment.title}</b>
                <span className={styles.big}>{formatMinor(e.payment.amount_minor, e.payment.currency)}</span>
                <span>{[formatLongDate(e.payment.due_on ?? props.weddingDate), e.when, byLine(e.payment)].filter(Boolean).join(" · ")}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="tn-muted">No cash payments yet. Choose Cash as the way to pay on a payment, and it appears here with the total to withdraw.</p>
      )}

      {plan.undecided.length ? (
        <section className={styles.card} aria-labelledby="und-h">
          <h2 id="und-h" className="tn-heading">Due on the day, way to pay not chosen</h2>
          <p>{plan.undecided.map((p) => `${p.title} (${formatMinor(p.amount_minor, p.currency)})`).join(", ")}. If any are cash, choose Cash on the payment.</p>
        </section>
      ) : null}

      {editing ? <HandoverSheet payment={editing} preview={props.preview} onClose={() => setEditing(null)} onDone={() => { setEditing(null); if (!props.preview) router.refresh(); }} /> : null}
    </>
  );
}

function HandoverSheet({ payment, preview, onClose, onDone }: { payment: Payment; preview?: boolean; onClose: () => void; onDone: () => void }) {
  const [time, setTime] = useState(payment.handover_time ?? "");
  const [note, setNote] = useState(payment.handover_note ?? "");
  const [by, setBy] = useState(payment.handover_by ?? "");
  const [error, setError] = useState<string | undefined>();
  async function save(e: FormEvent) {
    e.preventDefault();
    if (preview) { onDone(); return; }
    const { error } = await supabaseBrowser().from("payments")
      .update({ handover_time: time || null, handover_note: note.trim() || null, handover_by: by.trim() || null }).eq("id", payment.id);
    if (error) { setError("We couldn't save that just now. Try again."); return; }
    onDone();
  }
  return (
    <Sheet open title="When and who" onClose={onClose}>
      <form className="tn-stack" onSubmit={save} noValidate>
        <p><b>{payment.title}</b>, {formatMinor(payment.amount_minor, payment.currency)}</p>
        <TextField label="Time (optional)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <TextField label="When, in words (optional)" hint="For example: after the ceremony, end of the night" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />
        <TextField label="Who hands it over" hint="For example: Sam's sister, the best man" maxLength={80} value={by} onChange={(e) => setBy(e.target.value)} />
        {error ? <p className="tn-alert" role="alert">{error}</p> : null}
        <Button type="submit" block>Save</Button>
      </form>
    </Sheet>
  );
}
