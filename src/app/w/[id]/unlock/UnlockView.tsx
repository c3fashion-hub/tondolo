"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button, StatusChip, buttonClass } from "@/components/ui";
import { Mark, Wordmark } from "@/components/ui/Logo";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { PRICE_CURRENCIES, TEST_MODE, checkoutError, priceText, type PriceCurrency } from "@/lib/billing.ts";
import styles from "./unlock.module.css";

export type UnlockProps = {
  weddingId: string; owner: boolean; unlocked: boolean; used: number; currency: PriceCurrency;
  sessionId: string | null; cancelled: boolean; preview?: boolean;
};

const FREE_LIMIT = 5;
const CURRENCY_LABEL: Record<PriceCurrency, string> = { GBP: "Pounds", USD: "Dollars", EUR: "Euros" };

async function call(body: Record<string, string>): Promise<{ data?: Record<string, unknown>; error?: string }> {
  const { data, error } = await supabaseBrowser().functions.invoke("checkout", { body });
  if (!error) return { data };
  if (error instanceof FunctionsHttpError) { try { return { error: (await error.context.json()).error ?? "busy" }; } catch { return { error: "busy" }; } }
  return { error: "network" };
}

// Unlocking Tondolo: one payment through Stripe's secure checkout, as designed. Coming back from
// Stripe, the payment is checked with Stripe before the wedding unlocks.
export function UnlockView(props: UnlockProps) {
  const { weddingId } = props;
  const router = useRouter();
  const [currency, setCurrency] = useState<PriceCurrency>(props.currency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(props.unlocked);
  const [checking, setChecking] = useState(!!props.sessionId && !props.unlocked);
  const back = props.preview ? "/dev/money?screen=overview" : `/w/${weddingId}`;

  useEffect(() => {
    if (!props.sessionId || props.unlocked || props.preview) return;
    let tries = 0, stop = false;
    const check = async () => {
      const r = await call({ action: "confirm", wedding_id: weddingId, session_id: props.sessionId! });
      if (stop) return;
      if (r.data?.unlocked) { setUnlocked(true); setChecking(false); router.refresh(); return; }
      if (++tries < 6 && !r.error) setTimeout(check, 2000);
      else { setChecking(false); setError(r.error ? checkoutError(r.error) : "We haven't heard from Stripe yet. If you paid, this page will update shortly. Refresh it in a minute."); }
    };
    check();
    return () => { stop = true; };
  }, [props.sessionId, props.unlocked, props.preview, weddingId, router]);

  async function pay() {
    setBusy(true); setError("");
    if (props.preview) { setBusy(false); setError("This is the preview: payment opens Stripe's secure page on the real app."); return; }
    const r = await call({ action: "start", wedding_id: weddingId, currency });
    if (r.data?.url) { window.location.href = String(r.data.url); return; }
    setBusy(false);
    setError(checkoutError(r.error));
  }

  if (unlocked) {
    return (
      <div className={styles.page}>
        <div className={styles.brand}><Mark size={40} /><Wordmark /></div>
        <h1 className={styles.title}>Tondolo is unlocked</h1>
        <p className={styles.lead} role="status">Thank you. Every payment, scan, reminder and the Protection Kit are yours, for everyone you share with. Stripe has emailed your receipt.</p>
        <Link href={back} className={buttonClass({ block: true })}>Back to your wedding</Link>
      </div>
    );
  }

  if (checking) {
    return (
      <div className={styles.page}>
        <div className={styles.brand}><Mark size={40} /><Wordmark /></div>
        <h1 className={styles.title}>Checking your payment</h1>
        <p className={styles.lead} role="status">One moment while we hear back from Stripe.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href={back} className={styles.notNow}>Not now</Link>
      <div className={styles.brand}><Mark size={40} /><Wordmark /></div>
      <h1 className={styles.title}>Take the sour out of wedding money</h1>
      <span className={styles.chip}><StatusChip>You&rsquo;ve used {Math.min(props.used, FREE_LIMIT)} of {FREE_LIMIT} free payments</StatusChip></span>
      <ul className={styles.ticks}>
        <li><span aria-hidden="true">✓</span>Every payment, every currency, one total</li>
        <li><span aria-hidden="true">✓</span>Scan quotes, invoices and contracts</li>
        <li><span aria-hidden="true">✓</span>Reminders, voice notes and a weekly briefing</li>
        <li><span aria-hidden="true">✓</span>Share with your partner, planner and family</li>
      </ul>
      <section className={styles.offer} aria-labelledby="offer-h">
        <span className={styles.offerText}>
          <b id="offer-h">Tondolo, with the Protection Kit</b>
          <span>For up to 5 people, until 12 months after your wedding. The Kit covers contracts, deposits and what to do if something goes wrong.</span>
        </span>
        <b className={styles.price}>{priceText(currency)}</b>
      </section>
      <fieldset className={styles.currencies}>
        <legend>Pay in</legend>
        {PRICE_CURRENCIES.map((c) => (
          <label key={c} className={styles.currency}>
            <input type="radio" name="currency" value={c} checked={currency === c} onChange={() => setCurrency(c)} />
            <span>{CURRENCY_LABEL[c]} ({priceText(c)})</span>
          </label>
        ))}
      </fieldset>
      {TEST_MODE ? (
        <p className={styles.test}><b>Test mode.</b> No real money is taken. On Stripe&rsquo;s page, pay with card 4242 4242 4242 4242, any future date and any 3 digits.</p>
      ) : null}
      {props.cancelled ? <p className={styles.small} role="status">You didn&rsquo;t pay, and nothing has changed. You can pay whenever you&rsquo;re ready.</p> : null}
      {error ? <p className="tn-field-error" role="alert">{error}</p> : null}
      <div className={styles.bottom}>
        {props.owner ? (
          <Button block onClick={pay} disabled={busy}>{busy ? "Opening secure checkout…" : `Pay ${priceText(currency)}`}</Button>
        ) : (
          <p className={styles.lead}>Only the person who set up this wedding can pay for it. Ask them to open this page.</p>
        )}
        <span className={styles.small}>One payment, tax included. No subscription. Card, Apple Pay or Google Pay, with secure checkout by Stripe.</span>
        <span className={styles.fine}>Tondolo helps you organise your wedding money. Always check amounts, dates and details against your contracts, invoices and bank statements before you pay.</span>
      </div>
    </div>
  );
}
