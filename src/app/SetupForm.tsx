"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, TextField, buttonClass } from "@/components/ui";
import { CURRENCIES } from "@/lib/currencies.ts";
import { validateSetup, type SetupErrors, type SetupInput } from "@/lib/setup.ts";
import { saveSetupDraft } from "@/lib/setup-draft.ts";
import styles from "./welcome.module.css";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const FIELD_ORDER: (keyof SetupInput)[] = ["weddingDate", "destination", "homeCurrency", "names", "roughBudget"];

export function SetupForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<SetupErrors>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input: SetupInput = {
      weddingDate: String(f.get("weddingDate") ?? ""),
      destination: String(f.get("destination") ?? ""),
      homeCurrency: String(f.get("homeCurrency") ?? ""),
      names: String(f.get("names") ?? ""),
      roughBudget: String(f.get("roughBudget") ?? ""),
      useStarterBudget: f.get("useStarterBudget") === "on",
    };
    const result = validateSetup(input, localToday());
    if (!result.ok) {
      setErrors(result.errors);
      const first = FIELD_ORDER.find((k) => result.errors[k]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    saveSetupDraft(result.draft);
    router.push("/save");
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.fields}>
        <TextField label="Wedding date" name="weddingDate" type="date" required error={errors.weddingDate} />
        <TextField label="Where are you getting married?" name="destination" placeholder="e.g. Porto, Portugal" autoComplete="off" required error={errors.destination} />
        <div className="tn-field">
          <label className="tn-field-label" htmlFor="homeCurrency">Which currency do you pay from?</label>
          <select id="homeCurrency" name="homeCurrency" className="tn-input" defaultValue="GBP" aria-describedby="homeCurrency-hint" aria-invalid={errors.homeCurrency ? true : undefined}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.name}</option>)}
          </select>
          {errors.homeCurrency ? <span className="tn-field-error">{errors.homeCurrency}</span> : null}
          <em id="homeCurrency-hint" className="tn-field-hint">All your totals show in this currency.</em>
        </div>
        <TextField label="Your names (optional)" name="names" placeholder="e.g. Ade & Sam" autoComplete="off" maxLength={80} error={errors.names} />
        <TextField label="Rough total budget (optional)" name="roughBudget" inputMode="decimal" placeholder="e.g. 40,000" autoComplete="off" error={errors.roughBudget} />
        <label className={styles.starter}>
          <input type="checkbox" name="useStarterBudget" defaultChecked />
          <span><b>Start with the standard budget.</b> Every line couples forget, with a payment plan worked out from your date.</span>
        </label>
      </div>
      <div className={styles.actions}>
        <Button type="submit" variant="primary" block>Start my budget</Button>
        <Link href="/example" className={buttonClass({ variant: "secondary", block: true })}>Explore an example wedding</Link>
        <p className={styles.notice}>Tondolo helps you organise your wedding money. Always check amounts, dates and details against your contracts, invoices and bank statements before you pay.</p>
      </div>
    </form>
  );
}
