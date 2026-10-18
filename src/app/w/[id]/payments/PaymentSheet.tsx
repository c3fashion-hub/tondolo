"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, TextField } from "@/components/ui";
import { RatesNotice } from "@/components/RatesNotice";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { CURRENCIES } from "@/lib/currencies.ts";
import { GROUPS } from "@/lib/categories.ts";
import { formatMinor, minorToInput, parseAmountToMinor, parsePercentToBp } from "@/lib/money.ts";
import { supplierNameFrom } from "@/lib/suppliers.ts";
import { METHOD_LABEL, type Method, type Payment } from "@/lib/payments.ts";
import type { RateBook } from "@/lib/rates.ts";
import type { ViewProps } from "./PaymentsView";
import { CalendarLinks } from "@/components/calendar/CalendarLinks";
import { googlePaymentLink } from "@/lib/calendar.ts";
import styles from "./payments.module.css";

type Props = ViewProps & { book: RateBook; payment: Payment | "new" | null; onClose: () => void; onDone: () => void };
type Errors = Partial<Record<"title" | "amount" | "statement" | "fees" | "tax" | "form", string>>;

const METHODS = Object.keys(METHOD_LABEL) as Method[];
const LAST_CURRENCY = "tondolo.lastCurrency";

export function saveError(message: string): string {
  if (message.includes("free_limit")) return "You've added 5 payments, the most on the free start. Unlock Tondolo to add the rest.";
  if (message.includes("42501") || message.includes("row-level security")) return "You can only add or change payments you're covering.";
  return "We couldn't save that just now. Try again.";
}

export function PaymentSheet({ weddingId, home, people, me, book, today, payment, onClose, onDone }: Props) {
  const open = payment !== null;
  const existing = payment && payment !== "new" ? payment : null;
  const family = me.role === "family";

  const [status, setStatus] = useState<"due" | "paid">("due");
  const [currency, setCurrency] = useState(home);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method | "">("");
  const [statement, setStatement] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    let last = home;
    try { last = localStorage.getItem(LAST_CURRENCY) ?? home; } catch { /* use home */ }
    setStatus(existing?.status ?? "due");
    setCurrency(existing?.currency ?? last);
    setAmount(existing ? minorToInput(existing.amount_minor, existing.currency) : "");
    setMethod(existing?.method ?? "");
    setStatement(existing?.statement_minor ? minorToInput(existing.statement_minor, home) : "");
    setPaidOn(existing?.paid_on ?? today);
    setErrors({}); setConfirmDelete(false);
  }, [open, existing, home, today]);

  const amountMinor = parseAmountToMinor(amount, currency);
  const converted = amountMinor && currency !== home ? book.convert(amountMinor, currency, home, status === "paid" ? paidOn : today) : null;
  const unit = currency !== home ? book.unitRate(currency, home, today) : null;
  const statementMinor = parseAmountToMinor(statement, home);
  const rateGot = statementMinor && amountMinor && currency !== home ? statementMinor / amountMinor : null; // display only

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim();
    const next: Errors = {};
    if (!title) next.title = "Add who it's for, like Florist – deposit.";
    if (!amountMinor || amountMinor <= 0) next.amount = "Enter the amount, like 1,200.";
    const statementText = String(f.get("statement") ?? "").trim();
    if (status === "paid" && statementText && !statementMinor) next.statement = "Enter the amount from your statement, or leave it blank.";
    const feesText = String(f.get("fees") ?? "").trim();
    const fees = feesText ? parseAmountToMinor(feesText, home) : null;
    if (feesText && fees === null) next.fees = "Enter the fees, or leave them blank.";
    const taxText = String(f.get("taxRate") ?? "").trim();
    const taxBp = taxText ? parsePercentToBp(taxText) : null;
    if (taxText && taxBp === null) next.tax = "Enter a rate like 23, or leave it blank.";
    setErrors(next);
    if (Object.keys(next).length || !amountMinor) return;

    setBusy(true);
    const supabase = supabaseBrowser();
    const { data: supplierId } = await supabase.rpc("ensure_supplier", { p_wedding: weddingId, p_name: supplierNameFrom(title) });
    const taxChoice = String(f.get("taxIncluded") ?? "");
    const row = {
      title,
      category: String(f.get("category") ?? "") || null,
      amount_minor: amountMinor,
      currency,
      status,
      due_on: status === "due" ? String(f.get("dueOn") ?? "") || null : existing?.due_on ?? null,
      paid_on: status === "paid" ? paidOn || today : null,
      method: method || null,
      protected: String(f.get("protected") ?? "not_sure"),
      paying_member_id: family ? me.id : String(f.get("payer") ?? "") || null,
      statement_minor: status === "paid" && currency !== home ? statementMinor : null,
      fees_minor: fees,
      tax_included: taxChoice === "yes" ? true : taxChoice === "no" ? false : null,
      tax_rate_bp: taxBp,
      notes: String(f.get("notes") ?? "").trim() || null,
      supplier_id: (supplierId as string | null) ?? null,
      is_estimate: false,
    };
    const result = existing
      ? await supabase.from("payments").update(row).eq("id", existing.id)
      : await supabase.from("payments").insert({ ...row, wedding_id: weddingId });
    setBusy(false);
    if (result.error) { setErrors({ form: saveError(`${result.error.code} ${result.error.message}`) }); return; }
    try { localStorage.setItem(LAST_CURRENCY, currency); } catch { /* fine */ }
    onDone();
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from("payments").delete().eq("id", existing.id);
    setBusy(false);
    if (error) { setErrors({ form: "We couldn't delete that just now. Try again." }); return; }
    onDone();
  }

  const title = existing ? (existing.is_estimate ? "Replace with a real quote" : "Edit payment") : "Add payment";

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {confirmDelete && existing ? (
        <div className="tn-stack">
          <p>Delete {existing.title}? This can&rsquo;t be undone.</p>
          <Button block onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete payment"}</Button>
          <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>Keep it</Button>
        </div>
      ) : (
        <form className="tn-stack" onSubmit={save} noValidate key={existing?.id ?? "new"}>
          {existing?.is_estimate ? <p className="tn-note">This is an estimate from your starter budget. Enter the real figure from the quote and it becomes a real payment.</p> : null}
          <TextField label="Who is it for?" name="title" placeholder="e.g. Florist – deposit" defaultValue={existing?.title ?? ""} maxLength={120} error={errors.title} />
          <div className="tn-field">
            <label className="tn-field-label" htmlFor="p-category">Category</label>
            <select id="p-category" name="category" className="tn-input" defaultValue={existing?.category ?? ""}>
              <option value="">Choose a category</option>
              {GROUPS.map((g) => (
                <optgroup key={g.name} label={g.name}>
                  {g.lines.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className={styles.two}>
            <TextField label="Amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} autoComplete="off" />
            <div className="tn-field">
              <label className="tn-field-label" htmlFor="p-currency">Currency charged</label>
              <select id="p-currency" className="tn-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.name}</option>)}
              </select>
            </div>
          </div>
          {currency !== home ? (
            <div className="tn-stack" style={{ gap: 4, marginTop: -8 }}>
              <span className="tn-small tn-muted" aria-live="polite">
                {converted !== null ? `About ${formatMinor(converted, home, { whole: true })} at ${status === "paid" ? "the rate on the day paid" : "today's rate"}.`
                  : unit ? `1 ${currency} = ${unit.toFixed(4)} ${home} today.` : "We'll convert this once today's rate is in."}
              </span>
              <RatesNotice compact />
            </div>
          ) : null}
          <div className={styles.seg} role="group" aria-label="Status">
            <button type="button" aria-pressed={status === "due"} onClick={() => setStatus("due")}>Still to pay</button>
            <button type="button" aria-pressed={status === "paid"} onClick={() => setStatus("paid")}>Paid</button>
          </div>
          <div className={styles.two}>
            {status === "due"
              ? <TextField label="Due date" name="dueOn" type="date" defaultValue={existing?.due_on ?? ""} />
              : <TextField label="Date paid" name="paidOn" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} max={today} />}
            <div className="tn-field">
              <label className="tn-field-label" htmlFor="p-method">Paying by</label>
              <select id="p-method" className="tn-input" value={method} onChange={(e) => setMethod(e.target.value as Method | "")}>
                <option value="">Not decided</option>
                {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </div>
          </div>
          {method === "credit_card" ? <p className={`${styles.hint} ${styles.good}`}>Paying by credit card usually gives you the most protection.</p> : null}
          {method === "bank_transfer" || method === "cash" ? <p className={`${styles.hint} ${styles.warn}`}>Bank transfers and cash are hard to get back if a supplier lets you down. Get a receipt every time.</p> : null}

          <details className={styles.more} open={Boolean(existing && (existing.statement_minor || existing.fees_minor || existing.notes || existing.tax_included !== null))}>
            <summary>More details</summary>
            <div className={styles.moreBody}>
              {status === "paid" && currency !== home ? (
                <>
                  <TextField label={`Amount on your bank or card statement (${home}, optional)`} name="statement" inputMode="decimal"
                    value={statement} onChange={(e) => setStatement(e.target.value)} error={errors.statement}
                    hint="The exact figure that left your account. We'll use it instead of our conversion." />
                  {rateGot ? <p className={styles.hint}>That works out at 1 {currency} = {rateGot.toFixed(4)} {home}.</p> : null}
                </>
              ) : null}
              <div className="tn-field">
                <label className="tn-field-label" htmlFor="p-protected">Protected?</label>
                <select id="p-protected" name="protected" className="tn-input" defaultValue={existing?.protected ?? "not_sure"}>
                  <option value="not_sure">Not sure</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </div>
              {family ? null : (
                <div className="tn-field">
                  <label className="tn-field-label" htmlFor="p-payer">Who&rsquo;s paying?</label>
                  <select id="p-payer" name="payer" className="tn-input" defaultValue={existing?.paying_member_id ?? ""}>
                    <option value="">The couple</option>
                    {people.filter((m) => m.role === "family" || m.role === "planner").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              <TextField label={`Fees paid (${home}, optional)`} name="fees" inputMode="decimal" error={errors.fees}
                defaultValue={existing?.fees_minor ? minorToInput(existing.fees_minor, home) : ""} hint="Bank or card fees for this payment." />
              <div className={styles.two}>
                <div className="tn-field">
                  <label className="tn-field-label" htmlFor="p-taxIncluded">Tax included?</label>
                  <select id="p-taxIncluded" name="taxIncluded" className="tn-input" defaultValue={existing?.tax_included === true ? "yes" : existing?.tax_included === false ? "no" : ""}>
                    <option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option>
                  </select>
                </div>
                <TextField label="Tax rate %" name="taxRate" inputMode="decimal" error={errors.tax}
                  defaultValue={existing?.tax_rate_bp != null ? String(existing.tax_rate_bp / 100) : ""} />
              </div>
              <div className="tn-field">
                <label className="tn-field-label" htmlFor="p-notes">Notes</label>
                <textarea id="p-notes" name="notes" className="tn-input" maxLength={1000} defaultValue={existing?.notes ?? ""} />
              </div>
            </div>
          </details>

          {existing && !existing.is_estimate && existing.status === "due" && existing.due_on ? (
            <CalendarLinks ics={`/w/${weddingId}/calendar/payments?payment=${existing.id}`}
              google={googlePaymentLink({ id: existing.id, title: existing.title, amountText: formatMinor(existing.amount_minor, existing.currency), due_on: existing.due_on }, weddingId)} />
          ) : null}
          {errors.form ? <p className="tn-alert" role="alert">{errors.form}</p> : null}
          <Button type="submit" block disabled={busy}>{busy ? "Saving…" : "Save payment"}</Button>
          {existing ? <Button variant="secondary" block onClick={() => setConfirmDelete(true)}>Delete payment</Button> : null}
        </form>
      )}
    </Sheet>
  );
}
