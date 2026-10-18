"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MicButton } from "@/components/ui";
import { AskSheet } from "@/components/voice/AskSheet";
import { useSpeech } from "@/components/voice/useSpeech";
import { RateBook, type RateRow } from "@/lib/rates.ts";
import { briefing, type Reminder } from "@/lib/briefing.ts";
import { DAY_NAMES, type Checkin } from "@/lib/calendar.ts";
import type { Payment } from "@/lib/payments.ts";
import type { BookingConfirmation, ContractCheck, Supplier } from "@/lib/protection.ts";
import styles from "@/components/voice/voice.module.css";

export type BriefingProps = {
  weddingId: string; name: string; meId: string | null; today: string; unlocked: boolean;
  home: string; weddingDate: string; destination: string | null;
  payments: Payment[]; budgets: { category: string; amount_minor: number }[]; suppliers: Supplier[];
  checks: ContractCheck[]; bookings: BookingConfirmation[]; rates: RateRow[];
  people: { id: string; name: string }[]; reminders: Reminder[]; checkin: Checkin | null;
  preview?: boolean; closeHref?: string;
};

function checkinWhen(c: Checkin | null): string {
  if (!c) return "This week";
  const [h, m] = c.at_time.split(":").map(Number);
  const time = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  return `${DAY_NAMES[c.day - 1]} check-in · ${time}`;
}

// This week, out loud: the briefing shown on screen and read by the phone's own voice.
export function BriefingView(props: BriefingProps) {
  const book = useMemo(() => new RateBook(props.rates), [props.rates]);
  const b = useMemo(() => briefing({ ...props, home: props.home, book }), [props, book]);
  const speech = useSpeech();
  const [asking, setAsking] = useState(false);
  const close = props.closeHref ?? `/w/${props.weddingId}`;
  // The hello and the heading are read first; the list highlights the item being read.
  const now = speech.index - 2;
  const progress = speech.state === "idle" ? 0 : Math.round(((speech.index + 1) / b.sentences.length) * 100);

  return (
    <div className={styles.briefing}>
      <div className={styles.briefingInner}>
        <div className={styles.top}>
          <Link href={close} className={styles.close} onClick={() => speech.stop()}>Close</Link>
          <span className={styles.when}>{checkinWhen(props.checkin)}</span>
        </div>
        {!props.unlocked ? (
          <div className="tn-stack" style={{ gap: 10 }}>
            <span className={styles.kicker}>This week, out loud</span>
            <h1 className={styles.headline}>Your weekly briefing</h1>
            <p style={{ margin: 0, fontSize: 17, lineHeight: "26px" }}>Each week we&rsquo;ll read out what needs you, in your phone&rsquo;s own voice. It comes with Tondolo unlocked.</p>
          </div>
        ) : (
          <>
            <div className="tn-stack" style={{ gap: 6 }}>
              <span className={styles.kicker}>This week, out loud</span>
              <h1 className={styles.headline}>{b.heading}</h1>
            </div>
            <div className={styles.bar} role="progressbar" aria-label="Briefing read so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className={styles.barFill} style={{ width: `${progress}%` }} />
            </div>
            <ol className={styles.lines} aria-label="This week's briefing">
              <li className={speech.index === 0 ? styles.lineNow : styles.line}>{b.hello}</li>
              {b.items.map((s, i) => (
                <li key={i} className={i === now ? styles.lineNow : styles.line} aria-current={i === now ? "true" : undefined}>{s}</li>
              ))}
              {b.items.length === 0 ? <li className={styles.line}>{b.sentences[b.sentences.length - 1]}</li> : null}
            </ol>
          </>
        )}
        <div className={styles.bottom}>
          {props.unlocked && speech.supported ? (
            speech.state === "speaking" ? <button type="button" className={styles.play} onClick={speech.pause}>Pause</button>
              : speech.state === "paused" ? <button type="button" className={styles.play} onClick={speech.resume}>Carry on</button>
                : <button type="button" className={styles.play} onClick={() => speech.play(b.sentences)}>Play the briefing</button>
          ) : null}
          {props.unlocked ? <span className={styles.ask}><MicButton label="Ask a question" onClick={() => { speech.stop(); setAsking(true); }} /></span> : null}
          <p className={styles.small}>
            {speech.supported ? "Read by your phone’s own voice. Also on screen, so you can read along." : "This browser can’t read aloud, so read along on screen."}
          </p>
        </div>
      </div>
      <AskSheet weddingId={props.weddingId} open={asking} onClose={() => setAsking(false)} preview={props.preview} />
    </div>
  );
}
