"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, StatusChip } from "@/components/ui";
import { formatMinor } from "@/lib/money.ts";
import { formatShortDate } from "@/lib/dates.ts";
import { PAY_SAFELY_NOTICE, paySafely, type PaySafelyInput } from "@/lib/pay-safely.ts";
import { LANGUAGE_NAME, money, receiptRequest } from "@/lib/messages.ts";
import type { Language } from "@/lib/protection.ts";
import styles from "./protect.module.css";

// What to do before paying one payment, from the Protection Kit. The couple pays outside Tondolo.
export function PaySafelySheet({ input, language, contactName, converted, onClose, onPaid }: {
  input: PaySafelyInput | null; language: Language; contactName: string | null; converted: string | null;
  onClose: () => void; onPaid: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!input) return <Sheet open={false} title="" onClose={onClose}>{null}</Sheet>;
  const p = input.payment;
  const advice = paySafely(input);

  async function copy() {
    const text = receiptRequest(language, contactName ?? "", money(p.amount_minor, p.currency, language), p.title);
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <Sheet open title="Pay this safely" onClose={() => { setCopied(false); onClose(); }}>
      <div className="tn-stack">
        <div className={styles.head}>
          <b>{p.title}</b>
          <b>{formatMinor(p.amount_minor, p.currency)} {p.due_on ? <span>· due {formatShortDate(p.due_on)}</span> : null}</b>
        </div>
        {converted ? <p className="tn-small tn-muted" style={{ margin: "-8px 0 0" }}>{converted}</p> : null}
        {advice.map((a) => (
          <section key={a.key} className={`${styles.advice} ${a.tone ? `${styles.boxed} ${styles[a.tone]}` : styles.plain}`}>
            {a.chip ? <StatusChip tone={a.tone}>{a.chip}</StatusChip> : null}
            <h3>{a.title}</h3>
            <p>{a.body}</p>
          </section>
        ))}
        <p className={styles.notice}>{PAY_SAFELY_NOTICE}</p>
        <div className={styles.actions}>
          <Button block onClick={onPaid}>I&rsquo;ve paid it</Button>
          <Button block variant="secondary" onClick={copy}>Copy receipt request in {LANGUAGE_NAME[language]}</Button>
          <p className="tn-small tn-muted" role="status" style={{ margin: 0 }}>
            {copied ? "Copied. Paste it into WhatsApp or an email to the supplier once you've paid." : ""}
          </p>
        </div>
      </div>
    </Sheet>
  );
}
