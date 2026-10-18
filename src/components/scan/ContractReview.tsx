"use client";

import { useState } from "react";
import { Button, StatusChip, TextField, type Tone } from "@/components/ui";
import { MUST_HAVES } from "@/lib/protection.ts";
import { AI_NOTICE, MUST_HAVE_KEYS, RECOMMENDED_KEYS, RECOMMENDED_LABEL, type ContractResult } from "@/lib/reading.ts";
import styles from "./scan.module.css";

type State = "present" | "incomplete" | "missing";
const STATE_LABEL: Record<State, string> = { present: "In the contract", incomplete: "Incomplete", missing: "Missing" };
const STATE_TONE: Record<State, Tone> = { present: "paid", incomplete: "due", missing: "risk" };

export type ContractSave = { supplierName: string; result: ContractResult };

// The contract check, for a person to confirm. They can correct any clause before saving.
export function ContractReview({ fileName, result, supplierName: preset, suppliers, onSave, onSkip }: {
  fileName: string; result: ContractResult; supplierName: string | null; suppliers: { id: string; name: string }[];
  onSave: (s: ContractSave) => Promise<string | null>; onSkip: () => void;
}) {
  const matched = suppliers.find((s) => s.name.toLowerCase() === (preset ?? result.supplier_name ?? "").toLowerCase());
  const [name, setName] = useState(matched?.name ?? preset ?? result.supplier_name ?? "");
  const [r, setR] = useState(result);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gaps = MUST_HAVE_KEYS.filter((k) => r.must_haves[k].state !== "present").length;

  const setMust = (k: (typeof MUST_HAVE_KEYS)[number], state: State) => setR({ ...r, must_haves: { ...r.must_haves, [k]: { ...r.must_haves[k], state } } });
  const setRec = (k: (typeof RECOMMENDED_KEYS)[number], state: State) => setR({ ...r, recommended: { ...r.recommended, [k]: { ...r.recommended[k], state } } });

  async function save() {
    if (!name.trim()) { setError("Add the supplier's name."); return; }
    setBusy(true);
    const problem = await onSave({ supplierName: name.trim(), result: r });
    setBusy(false);
    if (problem) setError(problem);
  }

  const row = (key: string, label: string, state: State, evidence: string | null, onChange: (s: State) => void) => (
    <li key={key} className={styles.clause}>
      <div className={styles.clauseHead}>
        <b>{label.charAt(0).toUpperCase() + label.slice(1)}</b>
        <StatusChip tone={STATE_TONE[state]}>{STATE_LABEL[state]}</StatusChip>
      </div>
      {evidence ? <q className={styles.evidence}>{evidence}</q> : null}
      <label className={styles.inline}>
        <span>Correct it if it&rsquo;s wrong</span>
        <select className="tn-input" value={state} onChange={(e) => onChange(e.target.value as State)} aria-label={`${label}: what the contract says`}>
          <option value="present">In the contract</option>
          <option value="incomplete">Incomplete</option>
          <option value="missing">Missing</option>
        </select>
      </label>
    </li>
  );

  return (
    <div className="tn-stack">
      <div className={styles.file}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6" /><path d="M9 14h6" /></svg>
        <span><b>{fileName}</b><span>{[r.language ? `In ${r.language}` : null, gaps ? `${gaps} of 3 must-haves need attention` : "All 3 must-haves found"].filter(Boolean).join(" · ")}</span></span>
      </div>
      <TextField label="Supplier" value={name} onChange={(e) => setName(e.target.value)} list="contract-suppliers" autoComplete="off" />
      <datalist id="contract-suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>

      <section aria-labelledby="mh-h">
        <h3 id="mh-h" className="tn-heading">The three must-haves</h3>
        <ul className={styles.clauses}>
          {MUST_HAVE_KEYS.map((k) => row(k, MUST_HAVES.find((m) => m.key === k)!.label, r.must_haves[k].state, r.must_haves[k].evidence, (s) => setMust(k, s)))}
        </ul>
      </section>

      {r.red_flags.length ? (
        <section className={styles.warn} aria-labelledby="rf-h">
          <h3 id="rf-h" className={styles.warnTitle}>Worth asking about</h3>
          <ul>{r.red_flags.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
      ) : null}

      <details className={styles.more}>
        <summary>The seven recommended clauses</summary>
        <ul className={styles.clauses}>
          {RECOMMENDED_KEYS.map((k) => row(k, RECOMMENDED_LABEL[k], r.recommended[k].state, r.recommended[k].evidence, (s) => setRec(k, s)))}
        </ul>
      </details>

      {r.tax.status === "not_included" ? <p className="tn-small">Prices in this contract leave out tax{r.tax.wording ? ` ("${r.tax.wording}")` : ""}. Ask for the total including tax.</p> : null}
      <p className={styles.notice}>{AI_NOTICE}</p>
      {error ? <p className="tn-alert" role="alert">{error}</p> : null}
      <Button block onClick={save} disabled={busy}>{busy ? "Saving…" : "Save the contract check"}</Button>
      <Button block variant="secondary" onClick={onSkip} disabled={busy}>Don&rsquo;t save it</Button>
    </div>
  );
}
