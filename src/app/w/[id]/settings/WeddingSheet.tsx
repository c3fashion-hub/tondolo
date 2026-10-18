"use client";

import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, TextField } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { CURRENCIES } from "@/lib/currencies.ts";
import { validateSetup, type SetupErrors } from "@/lib/setup.ts";
import { formatMinor } from "@/lib/money.ts";
import type { Wedding } from "@/lib/wedding.ts";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WeddingSheet({ open, wedding, onClose, onDone }: { open: boolean; wedding: Wedding; onClose: () => void; onDone: () => void }) {
  const [errors, setErrors] = useState<SetupErrors & { form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const result = validateSetup({
      weddingDate: String(f.get("weddingDate") ?? ""), destination: String(f.get("destination") ?? ""),
      homeCurrency: String(f.get("homeCurrency") ?? ""), names: String(f.get("names") ?? ""),
      roughBudget: String(f.get("roughBudget") ?? ""), useStarterBudget: wedding.starter_used,
    }, localToday());
    if (!result.ok) { setErrors(result.errors); return; }
    setBusy(true);
    const d = result.draft;
    const { error } = await supabaseBrowser().from("weddings")
      .update({ wedding_date: d.weddingDate, destination: d.destination, home_currency: d.homeCurrency, names: d.names, rough_budget_minor: d.roughBudgetMinor })
      .eq("id", wedding.id);
    setBusy(false);
    if (error) { setErrors({ form: "We couldn't save that. Try again." }); return; }
    setErrors({});
    onDone();
  }

  return (
    <Sheet open={open} title="Your wedding" onClose={onClose}>
      <form className="tn-stack" onSubmit={save} noValidate>
        <TextField label="Wedding date" name="weddingDate" type="date" defaultValue={wedding.wedding_date} error={errors.weddingDate} />
        <TextField label="Where are you getting married?" name="destination" defaultValue={wedding.destination} error={errors.destination} />
        <TextField label="Your names (optional)" name="names" defaultValue={wedding.names ?? ""} maxLength={80} error={errors.names} />
        <div className="tn-field">
          <label className="tn-field-label" htmlFor="w-homeCurrency">Which currency do you pay from?</label>
          <select id="w-homeCurrency" name="homeCurrency" className="tn-input" defaultValue={wedding.home_currency} aria-describedby="w-homeCurrency-hint">
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.name}</option>)}
          </select>
          <em id="w-homeCurrency-hint" className="tn-field-hint">Changing this re-converts every total.</em>
        </div>
        <TextField label="Rough total budget (optional)" name="roughBudget" inputMode="decimal"
          defaultValue={wedding.rough_budget_minor ? formatMinor(wedding.rough_budget_minor, wedding.home_currency).replace(/[^\d.,]/g, "") : ""} error={errors.roughBudget} />
        {errors.form ? <p className="tn-alert" role="alert">{errors.form}</p> : null}
        <Button type="submit" block disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
      </form>
    </Sheet>
  );
}
