"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { AI_NOTICE } from "@/lib/reading.ts";
import { askError } from "@/lib/notes.ts";
import { exampleAnswer } from "@/lib/example/notes.ts";
import { useSpeech } from "./useSpeech";
import styles from "./voice.module.css";

// Ask a question: typed, or dictated with the keyboard's microphone. The answer is drawn only from
// this wedding, shown, and read aloud by the phone's own voice.
export function AskSheet({ weddingId, open, onClose, preview = false }: { weddingId: string; open: boolean; onClose: () => void; preview?: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const speech = useSpeech();
  const box = useRef<HTMLTextAreaElement>(null);

  const { stop } = speech;
  useEffect(() => { if (!open) stop(); }, [open, stop]);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) { setError("Type or say your question first."); return; }
    setBusy(true); setError(""); setAnswer(null);
    let text: string | null = null;
    if (preview) text = exampleAnswer(q);
    else {
      const { data, error: err } = await supabaseBrowser().functions.invoke("ask-question", { body: { wedding_id: weddingId, question: q } });
      if (err) {
        let code = "network";
        if (err instanceof FunctionsHttpError) { try { code = (await err.context.json()).error ?? "busy"; } catch { code = "busy"; } }
        setError(askError(code));
      } else text = data.result.answer as string;
    }
    setBusy(false);
    if (text) { setAnswer(text); speech.play([text]); }
  }

  return (
    <Sheet open={open} title="Ask a question" onClose={() => { speech.stop(); onClose(); }}>
      <form className="tn-stack" onSubmit={ask} noValidate>
        <div className="tn-field">
          <label className="tn-field-label" htmlFor="ask-q">Your question</label>
          <textarea ref={box} id="ask-q" className={`tn-input ${styles.box}`} style={{ minHeight: 72 }} maxLength={500}
            placeholder="What do I still owe in euros?" value={question} onChange={(e) => setQuestion(e.target.value)}
            aria-describedby="ask-hint" aria-invalid={error && !question.trim() ? true : undefined} />
          <p id="ask-hint" className={styles.hint}>To speak, tap the microphone on your keyboard. Answers come only from your own wedding.</p>
        </div>
        {error ? <p className="tn-field-error" role="alert">{error}</p> : null}
        <Button type="submit" block disabled={busy}>{busy ? "Working it out…" : "Ask"}</Button>
      </form>
      {answer ? (
        <section className={styles.answer} aria-live="polite" aria-label="Answer" style={{ marginTop: 16 }}>
          <p>{answer}</p>
          <p className={styles.notice}>{AI_NOTICE}</p>
          {speech.supported ? (
            <div className={styles.actions}>
              {speech.state === "speaking"
                ? <Button variant="secondary" size="sm" onClick={speech.stop}>Stop reading</Button>
                : <Button variant="secondary" size="sm" onClick={() => speech.play([answer])}>Read it aloud</Button>}
            </div>
          ) : null}
        </section>
      ) : null}
    </Sheet>
  );
}
