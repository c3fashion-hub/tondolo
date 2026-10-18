"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, TextField } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { formatMinor, parseAmountToMinor } from "@/lib/money.ts";
import type { Payment } from "@/lib/payments.ts";
import type { RateBook } from "@/lib/rates.ts";

// Marks a payment as paid. Asks for the statement amount, so the rate and fees can be worked out from it.
export function PaidSheet({ weddingHome, book, payment, today, onClose, onDone }: {
  weddingHome: string; book: RateBook; payment: Payment | null; today: string; onClose: () => void; onDone: () => void;
}) {
  const [paidOn, setPaidOn] = useState(today);
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPaidOn(today); setStatement(""); setError(undefined); }, [payment, today]);
  if (!payment) return <Sheet open={false} title="" onClose={onClose}>{null}</Sheet>;

  const foreign = payment.currency !== weddingHome;
  const atRate = foreign ? book.convert(payment.amount_minor, payment.currency, weddingHome, paidOn) : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!payment) return;
    const st = statement.trim() ? parseAmountToMinor(statement, weddingHome) : null;
    if (statement.trim() && !st) { setError("Enter the amount from your statement, or leave it blank."); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().from("payments")
      .update({ status: "paid", paid_on: paidOn || today, statement_minor: foreign ? st : null }).eq("id", payment.id);
    setBusy(false);
    if (error) { setError("We couldn't save that just now. Try again."); return; }
    onDone();
  }

  return (
    <Sheet open title="Mark as paid" onClose={onClose}>
      <form className="tn-stack" onSubmit={save} noValidate>
        <p><b>{payment.title}</b>, {formatMinor(payment.amount_minor, payment.currency)}</p>
        <TextField label="Date paid" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
        {foreign ? (
          <TextField label={`Amount on your bank or card statement (${weddingHome}, optional)`} inputMode="decimal" value={statement}
            onChange={(e) => setStatement(e.target.value)} error={error}
            hint={atRate !== null ? `Leave it blank to use the rate on the day: about ${formatMinor(atRate, weddingHome, { whole: true })}.` : "Leave it blank to use the rate on the day."} />
        ) : null}
        {!foreign && error ? <p className="tn-alert" role="alert">{error}</p> : null}
        <p className="tn-small tn-muted">Once it&rsquo;s paid, the amount in {weddingHome} is locked and won&rsquo;t move with the rates.</p>
        <Button type="submit" block disabled={busy}>{busy ? "Saving…" : "Mark as paid"}</Button>
      </form>
    </Sheet>
  );
}
