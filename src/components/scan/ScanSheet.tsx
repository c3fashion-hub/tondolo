"use client";

import { useEffect, useId, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { parseAmountToMinor } from "@/lib/money.ts";
import { contractRow, readError, type ContractResult, type ScanResult } from "@/lib/reading.ts";
import { MAX_FILES, discardDocument, readAll, type Mode, type ReadFail, type ReadOk } from "@/lib/scan-client.ts";
import { ScanReview, type ScanSave } from "./ScanReview";
import { ContractReview, type ContractSave } from "./ContractReview";
import styles from "./scan.module.css";

export const PRIVACY_NOTE = "Your documents are stored privately for your wedding, read only to suggest payments, never used to train any AI, and deleted with your wedding.";

type Props = {
  open: boolean; mode: Mode; weddingId: string; destination: string | null; today: string;
  suppliers: { id: string; name: string }[]; supplierName?: string | null;
  initial?: ReadOk[];        // the local preview starts at the review with example results
  onClose: () => void; onDone: () => void;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Scan up to 10 quotes, invoices or receipts (or check one contract), then check each before saving.
export function ScanSheet(props: Props) {
  const { mode, weddingId, today } = props;
  const inputId = useId();
  const [step, setStep] = useState<"pick" | "reading" | "review" | "done">(props.initial ? "review" : "pick");
  const [names, setNames] = useState<string[]>([]);
  const [results, setResults] = useState<(ReadOk | ReadFail | null)[]>(props.initial ?? []);
  const [index, setIndex] = useState(0);
  const [added, setAdded] = useState(0);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!props.open || props.initial) return;
    supabaseBrowser().rpc("document_reads_left", { w: weddingId }).then((res: { data: unknown }) => setLeft(typeof res.data === "number" ? res.data : null));
  }, [props.open, weddingId, props.initial]);

  const ok = results.filter((r): r is ReadOk => !!r && r.ok && (r.result as { readable: boolean }).readable);
  const failed = results.filter((r): r is ReadFail | ReadOk => !!r && (!r.ok || !(r.result as { readable: boolean }).readable));

  async function start(files: File[]) {
    if (!files.length) return;
    const chosen = files.slice(0, mode === "contract" ? 1 : MAX_FILES);
    setNames(chosen.map((f) => f.name));
    setResults(chosen.map(() => null));
    setStep("reading");
    await readAll(weddingId, chosen, mode, (i, r) => {
      setResults((rs) => rs.map((x, j) => (j === i ? r : x)));
      if (r.ok && r.readsLeft !== null) setLeft(r.readsLeft);
    });
    setStep("review");
  }

  function next() {
    if (index + 1 < ok.length) setIndex(index + 1); else setStep("done");
  }

  async function skip() {
    const r = ok[index];
    if (r && !props.initial) await discardDocument(r.documentId);
    next();
  }

  async function confirmDocument(documentId: string, supplierId: string | null, kind: string) {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("documents").update({ supplier_id: supplierId, kind, confirmed_by: user?.id ?? null, confirmed_at: new Date().toISOString() }).eq("id", documentId);
  }

  async function ensureSupplier(name: string): Promise<string | null> {
    if (!name) return null;
    const { data } = await supabaseBrowser().rpc("ensure_supplier", { p_wedding: weddingId, p_name: name });
    return (data as string | null) ?? null;
  }

  async function saveScan(item: ReadOk, s: ScanSave): Promise<string | null> {
    if (props.initial) { setAdded((a) => a + s.drafts.length); next(); return null; }
    const supabase = supabaseBrowser();
    const supplierId = await ensureSupplier(s.supplierName);
    if (supplierId) {
      // Fill in details the supplier record doesn't have yet; never overwrite what the couple typed.
      for (const [field, value] of [["legal_name", s.supplier.legal_name], ["email", s.supplier.email], ["phone", s.supplier.phone]] as const) {
        if (value) await supabase.from("suppliers").update({ [field]: value }).eq("id", supplierId).is(field, null);
      }
    }
    const rows = s.drafts.map((d) => ({
      wedding_id: weddingId,
      title: s.supplierName ? `${s.supplierName} – ${d.label.trim()}` : cap(d.label.trim()),
      amount_minor: parseAmountToMinor(d.amount, s.currency)!,
      currency: s.currency,
      status: d.status,
      due_on: d.status === "due" ? d.due_on || null : null,
      paid_on: d.status === "paid" ? d.paid_on || today : null,
      supplier_id: supplierId, category: s.category, document_id: item.documentId,
      tax_included: s.tax.tax_included, tax_rate_bp: s.tax.tax_rate_bp,
    }));
    const { error } = await supabase.from("payments").insert(rows);
    if (error) {
      return error.message.includes("free_limit")
        ? "Your free start includes 5 payments. You can add more once Tondolo is unlocked."
        : "We couldn't save these just now. Try again.";
    }
    await confirmDocument(item.documentId, supplierId, s.kind === "other" ? "other" : s.kind);
    setAdded((a) => a + rows.length);
    next();
    return null;
  }

  async function saveContract(item: ReadOk, s: ContractSave): Promise<string | null> {
    if (props.initial) { setAdded(1); next(); return null; }
    const supplierId = await ensureSupplier(s.supplierName);
    if (!supplierId) return "We couldn't save the supplier. Try again.";
    const { error } = await supabaseBrowser().from("contract_checks").insert({ wedding_id: weddingId, supplier_id: supplierId, document_id: item.documentId, ...contractRow(s.result) });
    if (error) return "We couldn't save the check just now. Try again.";
    await confirmDocument(item.documentId, supplierId, "contract");
    setAdded(1);
    next();
    return null;
  }

  const title = step === "review" ? (mode === "contract" ? "Check the contract" : "Check what we found")
    : mode === "contract" ? "Check a contract" : "Scan documents";
  const current = ok[index];

  return (
    <Sheet open={props.open} title={title} closeLabel={step === "review" ? "Cancel" : "Close"} onClose={step === "done" ? props.onDone : props.onClose}>
      {step === "pick" ? (
        <div className="tn-stack">
          <p>{mode === "contract"
            ? "Upload the contract as a PDF or photos of each page. We check it against the Protection Kit's three must-haves and seven recommended clauses."
            : "Take a photo or upload PDFs of quotes, invoices or receipts, up to 10 at once. We fill in the payments for you to check."}</p>
          <input id={inputId} type="file" className={`visually-hidden ${styles.pickInput}`} accept="image/*,application/pdf" multiple={mode !== "contract"}
            onChange={(e) => start(Array.from(e.target.files ?? []))} />
          <label htmlFor={inputId} className={`tn-btn tn-btn-primary tn-btn-md tn-btn-block ${styles.pickLabel}`}>
            {mode === "contract" ? "Choose the contract" : "Take a photo or choose files"}
          </label>
          <p className="tn-small tn-muted">{PRIVACY_NOTE}</p>
          {left !== null ? <p className="tn-small tn-muted">{left === 0 ? "You've used the scans included so far. You can still add payments by hand." : `${left} ${left === 1 ? "document" : "documents"} left to read on your plan.`}</p> : null}
        </div>
      ) : null}

      {step === "reading" ? (
        <div className="tn-stack" aria-live="polite">
          <p>Reading {names.length === 1 ? "your document" : `${names.length} documents`}. This can take a minute.</p>
          <ul className={styles.progress}>
            {names.map((n, i) => {
              const r = results[i];
              return <li key={`${n}-${i}`}><b>{n}</b><span>{!r ? "Reading…" : r.ok ? "Ready to check" : readError(r.error)}</span></li>;
            })}
          </ul>
        </div>
      ) : null}

      {step === "review" && current ? (
        mode === "contract"
          ? <ContractReview key={current.documentId} fileName={current.fileName} result={current.result as ContractResult} supplierName={props.supplierName ?? null}
              suppliers={props.suppliers} onSave={(s) => saveContract(current, s)} onSkip={skip} />
          : <ScanReview key={current.documentId} fileName={current.fileName} result={current.result as ScanResult} destination={props.destination} today={today}
              position={ok.length > 1 ? `${index + 1} of ${ok.length}` : undefined} onSave={(s) => saveScan(current, s)} onSkip={skip} />
      ) : null}

      {(step === "review" && !current) || step === "done" ? (
        <div className="tn-stack" aria-live="polite">
          {added ? <p><b>{mode === "contract" ? "Contract check saved." : `Added ${added} ${added === 1 ? "payment" : "payments"}.`}</b></p> : null}
          {failed.length ? (
            <ul className={styles.progress}>
              {failed.map((r) => (
                <li key={r.fileName}><b>{r.fileName}</b><span>{r.ok ? (r.result as { problem: string | null }).problem ?? readError("unreadable") : readError(r.error)}</span></li>
              ))}
            </ul>
          ) : null}
          {!added && !failed.length ? <p>Nothing was added.</p> : null}
          <Button block onClick={props.onDone}>Done</Button>
        </div>
      ) : null}
    </Sheet>
  );
}
