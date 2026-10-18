"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button, MicButton, StatusChip } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { AI_NOTICE } from "@/lib/reading.ts";
import { formatShortDate } from "@/lib/dates.ts";
import {
  actionLabel, actionMinor, noteError, usualCurrency,
  type NoteAction, type NoteResult, type NoteRow, type ReminderRow,
} from "@/lib/notes.ts";
import { exampleNote } from "@/lib/example/notes.ts";
import type { Payment } from "@/lib/payments.ts";
import type { Supplier } from "@/lib/protection.ts";
import styles from "@/components/voice/voice.module.css";

export type NotesProps = {
  weddingId: string; home: string; today: string; unlocked: boolean;
  notes: NoteRow[]; reminders: ReminderRow[]; suppliers: Supplier[]; payments: Payment[];
  preview?: boolean;
};

// Notes: typed, or spoken with the keyboard's microphone. We suggest what to file (a payment made,
// a detail agreed with a supplier, a reminder); nothing is saved until the couple taps Save note.
// Only the words are kept, never a recording. Private to the two partners.
export function NotesView(props: NotesProps) {
  const { weddingId, today, preview } = props;
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const [words, setWords] = useState("");
  const [micHint, setMicHint] = useState(false);
  const [result, setResult] = useState<NoteResult | null>(null);
  const [ticked, setTicked] = useState<boolean[]>([]);
  const [busy, setBusy] = useState<"" | "reading" | "saving">("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [notes, setNotes] = useState(props.notes);
  const [reminders, setReminders] = useState(props.reminders);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fallbackCurrency = usualCurrency(props.payments, props.home);
  const supplierName = (id: string | null) => props.suppliers.find((s) => s.id === id)?.name ?? null;
  const ctx = { suppliers: props.suppliers, payments: props.payments, today, fallbackCurrency };

  function speak() {
    box.current?.focus();
    setMicHint(true);
  }

  async function suggest() {
    const text = words.trim();
    if (!text) { setError("Type or say your note first."); return; }
    setBusy("reading"); setError(""); setSaved(""); setResult(null);
    let r: NoteResult | null = null;
    if (preview) r = exampleNote(text);
    else {
      const { data, error: err } = await supabaseBrowser().functions.invoke("read-note", { body: { wedding_id: weddingId, words: text } });
      if (err) {
        let code = "network";
        if (err instanceof FunctionsHttpError) { try { code = (await err.context.json()).error ?? "busy"; } catch { code = "busy"; } }
        setError(noteError(code));
      } else r = data.result as NoteResult;
    }
    setBusy("");
    if (r) { setResult(r); setTicked(r.actions.map(() => true)); }
  }

  function reset(message: string) {
    setWords(""); setResult(null); setTicked([]); setMicHint(false); setSaved(message);
  }

  async function save() {
    const text = words.trim();
    if (!text) { setError("Type or say your note first."); return; }
    const chosen = (result?.actions ?? []).filter((_, i) => ticked[i]);
    setBusy("saving"); setError("");
    const message = chosen.length ? `Note saved, with ${chosen.length} ${chosen.length === 1 ? "thing" : "things"} filed.` : "Note saved.";

    if (preview) {
      const id = `n${Date.now()}`;
      setNotes((n) => [{ id, words: text, kind: "note", supplier_id: result?.supplier_id ?? null, noted_on: today },
        ...chosen.filter((a) => a.type === "booking_detail").map((a, i) => ({ id: `${id}-${i}`, words: a.text!, kind: "booking_detail" as const, supplier_id: a.supplier_id, noted_on: today })), ...n]);
      setReminders((r) => [...r, ...chosen.filter((a) => a.type === "reminder").map((a, i) => ({ id: `${id}-r${i}`, text: a.text!, due_on: a.date!, done: false }))]
        .sort((a, b) => a.due_on.localeCompare(b.due_on)));
      setBusy(""); reset(message);
      return;
    }

    const supabase = supabaseBrowser();
    const note = await supabase.from("notes").insert({ wedding_id: weddingId, words: text, kind: "note", supplier_id: result?.supplier_id ?? null })
      .select("id").single();
    if (note.error) { setBusy(""); setError("We couldn't save your note just now. Try again."); return; }
    const failed: string[] = [];
    for (const a of chosen) {
      if (!(await file(a, note.data.id))) failed.push(actionLabel(a, ctx));
    }
    setBusy("");
    if (failed.length) {
      setWords(""); setResult(null); setTicked([]);
      setError(`Your note is saved, but we couldn't file: ${failed.join("; ")}. Add ${failed.length === 1 ? "it" : "them"} by hand.`);
    } else reset(message);
    router.refresh();
  }

  // Files one confirmed suggestion, as the signed-in person (row-level security applies).
  async function file(a: NoteAction, noteId: string): Promise<boolean> {
    const supabase = supabaseBrowser();
    const supplierId = async () => {
      if (a.supplier_id) return a.supplier_id;
      if (!a.supplier_name) return null;
      const { data } = await supabase.rpc("ensure_supplier", { p_wedding: weddingId, p_name: a.supplier_name });
      return (data as string | null) ?? null;
    };
    if (a.type === "payment_paid") {
      const m = actionMinor(a, fallbackCurrency);
      if (!m) return false;
      if (a.payment_id) {
        const { error } = await supabase.from("payments").update({ status: "paid", paid_on: a.date ?? today, ...(a.method ? { method: a.method } : {}) })
          .eq("id", a.payment_id).eq("status", "due");
        return !error;
      }
      const { error } = await supabase.from("payments").insert({
        wedding_id: weddingId, title: a.title ?? "Payment", category: a.category, amount_minor: m.minor, currency: m.currency,
        status: "paid", paid_on: a.date ?? today, method: a.method, supplier_id: await supplierId(), is_estimate: false, notes: "Added from a note",
      });
      return !error;
    }
    if (a.type === "booking_detail") {
      const { error } = await supabase.from("notes").insert({ wedding_id: weddingId, words: a.text, kind: "booking_detail", supplier_id: await supplierId() });
      return !error;
    }
    const { error } = await supabase.from("reminders").insert({ wedding_id: weddingId, text: a.text, due_on: a.date, note_id: noteId });
    return !error;
  }

  async function toggleReminder(r: ReminderRow) {
    const done = !r.done;
    setReminders((rs) => rs.map((x) => (x.id === r.id ? { ...x, done } : x)));
    if (preview) return;
    const { error } = await supabaseBrowser().from("reminders").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", r.id);
    if (error) { setReminders((rs) => rs.map((x) => (x.id === r.id ? { ...x, done: r.done } : x))); setError("We couldn't update that reminder. Try again."); }
  }

  async function remove(n: NoteRow) {
    if (!preview) {
      const { error } = await supabaseBrowser().from("notes").delete().eq("id", n.id);
      if (error) { setError("We couldn't delete that note. Try again."); return; }
    }
    setNotes((ns) => ns.filter((x) => x.id !== n.id));
    setConfirmDelete(null);
  }

  const open = reminders.filter((r) => !r.done);
  const done = reminders.filter((r) => r.done);

  return (
    <>
      <div className="tn-stack" style={{ gap: 6 }}>
        <h1 className="tn-title">Notes</h1>
        <p className="tn-muted" style={{ fontSize: 15 }}>Say it instead of typing it. We&rsquo;ll suggest the payments, times and reminders to file.</p>
      </div>

      <section className="tn-stack" aria-label="New note" style={{ gap: 10 }}>
        <div className={styles.micRow}>
          <MicButton onClick={speak} />
          <span className={styles.hint} aria-live="polite">{micHint ? "Now tap the microphone on your keyboard and speak." : "Uses your keyboard’s microphone."}</span>
        </div>
        <div className="tn-field">
          <label className="tn-field-label" htmlFor="note-words">Your note</label>
          <textarea ref={box} id="note-words" className={`tn-input ${styles.box}`} maxLength={4000} value={words}
            placeholder="Paid the florist 500 euros in cash"
            onChange={(e) => { setWords(e.target.value); setSaved(""); if (result) setResult(null); }}
            aria-describedby="note-hint" />
          <p id="note-hint" className={styles.hint}>We keep your words, never a recording. Only the two of you can see notes.</p>
        </div>
        {error ? <p className="tn-field-error" role="alert">{error}</p> : null}
        {saved ? <p className={styles.status} role="status">{saved}</p> : null}

        {result ? (
          <section className={styles.suggest} aria-labelledby="suggest-h">
            <h2 id="suggest-h" className={styles.suggestTitle}>{result.actions.length ? "We'll also do this" : "Nothing to file from this note"}</h2>
            {result.actions.map((a, i) => (
              <label key={i} className={styles.option}>
                <input type="checkbox" checked={ticked[i] ?? false} onChange={(e) => setTicked((t) => t.map((x, j) => (j === i ? e.target.checked : x)))} />
                <span>{actionLabel(a, ctx)}</span>
              </label>
            ))}
            <p className={styles.notice}>{AI_NOTICE}</p>
            <Button size="sm" onClick={save} disabled={busy !== ""}>{busy === "saving" ? "Saving…" : "Save note"}</Button>
          </section>
        ) : (
          <div className={styles.actions}>
            {props.unlocked ? <Button onClick={suggest} disabled={busy !== ""}>{busy === "reading" ? "Reading your note…" : "Suggest what to file"}</Button> : null}
            <Button variant={props.unlocked ? "secondary" : "primary"} onClick={save} disabled={busy !== ""}>{busy === "saving" ? "Saving…" : props.unlocked ? "Just save the note" : "Save note"}</Button>
          </div>
        )}
        {!props.unlocked ? <p className={styles.hint}>Once Tondolo is unlocked, we&rsquo;ll suggest what to file from each note. <Link href={`/w/${weddingId}/unlock`}>Unlock Tondolo</Link></p> : null}
      </section>

      {open.length || done.length ? (
        <section className="tn-stack" aria-labelledby="rem-h" style={{ gap: 2 }}>
          <h2 id="rem-h" className="tn-heading">Reminders</h2>
          <ul className={styles.list}>
            {[...open, ...done].map((r) => (
              <li key={r.id} className={styles.item}>
                <label className={styles.reminder}>
                  <input type="checkbox" checked={r.done} onChange={() => toggleReminder(r)} />
                  <span className={r.done ? styles.done : undefined}>{r.text}<span>{r.done ? "Done" : `${r.due_on < today ? "Was due" : "Due"} ${formatShortDate(r.due_on)}`}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="tn-stack" aria-labelledby="notes-h" style={{ gap: 2 }}>
        <h2 id="notes-h" className="tn-heading">Your notes</h2>
        {notes.length ? (
          <ul className={styles.list}>
            {notes.map((n) => (
              <li key={n.id} className={styles.item}>
                {n.supplier_id || n.kind === "booking_detail" ? (
                  <span className={styles.itemChips}>
                    {n.kind === "booking_detail" ? <StatusChip tone="paid">Booking detail</StatusChip> : null}
                    {n.supplier_id ? <StatusChip>{supplierName(n.supplier_id)}</StatusChip> : null}
                  </span>
                ) : null}
                <p className={styles.itemWords}>{n.words}</p>
                <span className={styles.itemMeta}>
                  <span>{formatShortDate(n.noted_on)}</span>
                  {confirmDelete === n.id ? (
                    <span className={styles.actions}>
                      <Button variant="link" size="sm" onClick={() => setConfirmDelete(null)}>Keep</Button>
                      <Button variant="link" size="sm" onClick={() => remove(n)}>Delete note</Button>
                    </span>
                  ) : (
                    <Button variant="link" size="sm" onClick={() => setConfirmDelete(n.id)} aria-label={`Delete note from ${formatShortDate(n.noted_on)}`}>Delete</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="tn-muted">No notes yet. Your first one will appear here.</p>}
      </section>
    </>
  );
}
