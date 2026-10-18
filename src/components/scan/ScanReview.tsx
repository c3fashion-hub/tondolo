"use client";

import { useState } from "react";
import { Button, StatusChip, TextField } from "@/components/ui";
import { CATEGORIES } from "@/lib/categories.ts";
import { CURRENCIES } from "@/lib/currencies.ts";
import { formatMinor, parseAmountToMinor } from "@/lib/money.ts";
import { AI_NOTICE, draftsFrom, missingTax, taxFields, type Draft, type ScanResult } from "@/lib/reading.ts";
import styles from "./scan.module.css";

export type ScanSave = {
  supplierName: string; currency: string; category: string | null; drafts: Draft[];
  tax: ReturnType<typeof taxFields>; supplier: ScanResult["supplier"]; kind: ScanResult["document_kind"];
};

// "Check what we found": everything the AI read, editable, and nothing saved until "Add N payments".
export function ScanReview({ fileName, result, destination, today, position, onSave, onSkip }: {
  fileName: string; result: ScanResult; destination: string | null; today: string; position?: string;
  onSave: (s: ScanSave) => Promise<string | null>; onSkip: () => void;
}) {
  const [supplierName, setSupplierName] = useState(result.supplier.name ?? "");
  const [currency, setCurrency] = useState(result.currency ?? "");
  const [category, setCategory] = useState(result.category ?? "");
  const [drafts, setDrafts] = useState<Draft[]>(() => draftsFrom(result, "", today));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const chosen = drafts.filter((d) => d.include);
  const tax = missingTax({ ...result, currency: currency || null, category: category || null }, drafts, destination);
  const taxName = /portugal|spain|españa/i.test(destination ?? "") ? "IVA" : "tax";
  const totalMinor = result.total && currency ? parseAmountToMinor(result.total, currency) : null;

  async function save() {
    setError(null);
    if (!currency) { setError("Choose the currency the amounts are in."); return; }
    const bad = chosen.find((d) => parseAmountToMinor(d.amount, currency) === null || !d.label.trim());
    if (bad) { setError(`Check the amount and name of "${bad.label || "each payment"}".`); return; }
    setBusy(true);
    const problem = await onSave({ supplierName: supplierName.trim(), currency, category: category || null, drafts: chosen, tax: taxFields(result), supplier: result.supplier, kind: result.document_kind });
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <div className="tn-stack">
      <div className={styles.file}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6" /><path d="M9 14h6" /></svg>
        <span><b>{fileName}</b><span>{[position, result.language ? `In ${result.language}` : null, `${result.payments.length} ${result.payments.length === 1 ? "payment" : "payments"} found`].filter(Boolean).join(" · ")}</span></span>
      </div>

      <TextField label="Supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} autoComplete="off" />
      <div className={styles.two}>
        <div className="tn-field">
          <label className="tn-field-label" htmlFor="sr-cur">Currency</label>
          <select id="sr-cur" className="tn-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">Choose…</option>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        <div className="tn-field">
          <label className="tn-field-label" htmlFor="sr-cat">Category</label>
          <select id="sr-cat" className="tn-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Not sure</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <fieldset className={styles.payments}>
        <legend className="tn-field-label">Payments to add</legend>
        {drafts.map((d) => (
          <div key={d.key} className={styles.payment}>
            <label className={styles.include}>
              <input type="checkbox" checked={d.include} onChange={(e) => set(d.key, { include: e.target.checked })} />
              <span>Add this one</span>
            </label>
            <div className={styles.two}>
              <TextField label="Payment" value={d.label} onChange={(e) => set(d.key, { label: e.target.value })} disabled={!d.include} />
              <TextField label={`Amount${currency ? ` (${currency})` : ""}`} inputMode="decimal" value={d.amount} disabled={!d.include}
                onChange={(e) => set(d.key, { amount: e.target.value, doubtful: false })}
                error={d.include && d.doubtful ? "We couldn't read this. Type it in." : undefined} />
            </div>
            <div className={styles.two}>
              <div className="tn-field">
                <label className="tn-field-label" htmlFor={`st-${d.key}`}>Status</label>
                <select id={`st-${d.key}`} className="tn-input" value={d.status} disabled={!d.include}
                  onChange={(e) => set(d.key, { status: e.target.value as Draft["status"], paid_on: e.target.value === "paid" ? d.paid_on || today : "" })}>
                  <option value="due">Still to pay</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              {d.status === "paid"
                ? <TextField label="Date paid" type="date" max={today} value={d.paid_on} disabled={!d.include} onChange={(e) => set(d.key, { paid_on: e.target.value })} />
                : <TextField label="Due date" type="date" value={d.due_on} disabled={!d.include} onChange={(e) => set(d.key, { due_on: e.target.value })}
                    hint={d.due_on ? undefined : "No date found"} />}
            </div>
          </div>
        ))}
        {!drafts.length ? <p className="tn-muted">No amounts found. You can add the payments by hand.</p> : null}
      </fieldset>

      {totalMinor !== null && currency ? (
        <p className="tn-small tn-muted">Total on the document: {formatMinor(totalMinor, currency)}{result.tax.status === "not_included" ? `, without ${taxName}` : ""}.</p>
      ) : null}

      {result.tax.status === "not_included" ? (
        <section className={styles.warn}>
          <span><StatusChip tone="due">{taxName} not included</StatusChip></span>
          <p>{tax && currency
            ? <>This leaves out {taxName} at {tax.rateBp / 100}%, about <b>{formatMinor(tax.minor, currency, { whole: true })}</b>. Ask {supplierName || "the supplier"} for the total including tax.</>
            : <>The price leaves out tax{result.tax.wording ? ` ("${result.tax.wording}")` : ""}. Ask {supplierName || "the supplier"} for the total including tax.</>}</p>
        </section>
      ) : result.tax.status === "not_shown" ? (
        <p className="tn-small tn-muted">Tax isn&rsquo;t shown on this document. Ask {supplierName || "the supplier"} whether it&rsquo;s included.</p>
      ) : null}

      <p className={styles.notice}>{AI_NOTICE}</p>
      {error ? <p className="tn-alert" role="alert">{error}</p> : null}
      <Button block onClick={save} disabled={busy || !chosen.length}>
        {busy ? "Saving…" : chosen.length ? `Add ${chosen.length} ${chosen.length === 1 ? "payment" : "payments"}` : "Choose a payment to add"}
      </Button>
      <Button block variant="secondary" onClick={onSkip} disabled={busy}>Don&rsquo;t add these</Button>
    </div>
  );
}
