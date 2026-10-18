"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { StatusChip, TextField, buttonClass } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import {
  LANGUAGES, arrivalPoint, bookingMessage, bookingSubject, emailLink, pointLabel, pricePoint, whatsappLink, whenWherePoint,
  type PricePart,
} from "@/lib/messages.ts";
import type { Language, Supplier } from "@/lib/protection.ts";
import styles from "./protect.module.css";

export type ConfirmProps = {
  weddingId: string; supplier: Supplier; level: 2 | 3; weddingDate: string; place: string; today: string;
  price: PricePart | null; preview?: boolean; onClose: () => void; onSent: () => void;
};

// Confirm a booking: the Protection Kit's six points, as a message the couple send themselves by
// WhatsApp or email. Sending it records what was sent and when, for the claim pack.
export function ConfirmSheet(props: ConfirmProps) {
  const { supplier } = props;
  const [lang, setLang] = useState<Language>(supplier.language ?? "en");
  const [name, setName] = useState(supplier.contact_name ?? supplier.name);
  const [who, setWho] = useState(supplier.contact_name ?? "");
  const [what, setWhat] = useState("");
  const [arrive, setArrive] = useState("");
  const [ready, setReady] = useState("");
  // Prefilled in the supplier's language until the couple edits them.
  const [whenWhere, setWhenWhere] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const autoWhen = whenWherePoint(lang, props.weddingDate, props.place);
  const autoPrice = props.price ? pricePoint(lang, props.price) : "";
  const points = { who, what, whenWhere: whenWhere ?? autoWhen, arrival: arrivalPoint(lang, arrive, ready), price: price ?? autoPrice };
  const message = bookingMessage(lang, name, points);
  const missing = (["who", "what", "whenWhere", "arrival", "price"] as const).filter((k) => !points[k].trim());

  async function record() {
    if (props.preview) return;
    const { error } = await supabaseBrowser().from("booking_confirmations").insert({
      wedding_id: props.weddingId, supplier_id: supplier.id, points, language: lang, arrive_at: arrive || null, sent_on: props.today,
    });
    if (error) { setError("We couldn't record that it was sent. It will still open, so keep a screenshot."); return; }
    props.onSent();
  }

  return (
    <Sheet open title="Confirm your booking" onClose={props.onClose}>
      <div className="tn-stack">
        <div className="tn-stack" style={{ gap: 4 }}>
          <span><StatusChip>{props.level === 3 ? "Level 3 · a message is enough" : "Level 2 · a confirmed message is enough"}</StatusChip></span>
          <p className="tn-muted" style={{ fontSize: 14, lineHeight: "20px" }}>No contract needed. Get these six points confirmed in writing.</p>
        </div>

        <div role="group" aria-label="Message language" className={styles.seg}>
          {LANGUAGES.map((l) => (
            <button key={l.code} type="button" lang={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>{l.label}</button>
          ))}
        </div>

        <TextField label="Who you're writing to" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <TextField label={`1. ${pointLabel("en", "who")}`} hint="Their name and number, and who will actually turn up" value={who} onChange={(e) => setWho(e.target.value)} />
        <TextField label={`2. ${pointLabel("en", "what")}`} hint="The service, the hours and how many people they're bringing" value={what} onChange={(e) => setWhat(e.target.value)} />
        <TextField label={`3. ${pointLabel("en", "whenWhere")}`} value={points.whenWhere} onChange={(e) => setWhenWhere(e.target.value)} />
        <fieldset className={styles.two} style={{ border: "none", margin: 0, padding: 0 }}>
          <legend className="tn-field-label" style={{ marginBottom: 6 }}>4. {pointLabel("en", "arrival")}</legend>
          <TextField label="Arrives at" type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} />
          <TextField label="Everything ready by" type="time" value={ready} onChange={(e) => setReady(e.target.value)} />
        </fieldset>
        <TextField label={`5. ${pointLabel("en", "price")}`} hint="The total, what's included (travel, tax, extra hours), the deposit and when the balance is due"
          value={points.price} onChange={(e) => setPrice(e.target.value)} />
        <p className={styles.status}><b>6. If they can&rsquo;t come:</b> they send a replacement you&rsquo;ve agreed, or return your deposit. This is always in the message.</p>

        <h3 className="tn-field-label" style={{ margin: 0 }}>The message</h3>
        <pre className={styles.message} lang={lang} aria-live="polite">{message}</pre>
        {missing.length ? <p className="tn-small tn-muted">Still to fill in: {missing.map((k) => pointLabel("en", k).toLowerCase()).join(", ")}. You can send it anyway.</p> : null}
        {error ? <p className="tn-alert" role="alert">{error}</p> : null}

        <div className={styles.actions}>
          <a href={whatsappLink(supplier.phone, message)} target="_blank" rel="noopener noreferrer" className={buttonClass({ block: true })} onClick={record}>Send on WhatsApp</a>
          <a href={emailLink(supplier.email, bookingSubject(lang), message)} className={buttonClass({ variant: "secondary", block: true })} onClick={record}>Send by email</a>
        </div>
        <p className="tn-small tn-muted">It opens on your phone for you to send. When {name.trim() || "they"} {name.trim() ? "replies" : "reply"}, screenshot it and keep it with your receipts.</p>
      </div>
    </Sheet>
  );
}
