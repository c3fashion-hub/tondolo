"use client";

import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, TextField } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { GROUPS } from "@/lib/categories.ts";
import { minorToInput, parseAmountToMinor } from "@/lib/money.ts";
import type { BudgetGroup } from "@/lib/payments.ts";

// Edit the budget for each line in a group, or add a new line.
export function BudgetSheet({ weddingId, home, target, budgets, onClose, onDone }: {
  weddingId: string; home: string; target: BudgetGroup | "new" | null; budgets: { category: string; amount_minor: number }[];
  onClose: () => void; onDone: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const isNew = target === "new";
  const group = target && target !== "new" ? target : null;
  const groupLines = group ? (GROUPS.find((g) => g.name === group.name)?.lines.map((l) => l.name) ?? group.lines.map((l) => l.category)) : [];
  const current = (c: string) => budgets.find((b) => b.category === c)?.amount_minor ?? 0;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const entries: { category: string; text: string }[] = isNew
      ? [{ category: String(f.get("category") ?? ""), text: String(f.get("amount") ?? "") }]
      : groupLines.map((c) => ({ category: c, text: String(f.get(c) ?? "") }));
    const rows: { wedding_id: string; category: string; amount_minor: number }[] = [];
    for (const { category, text } of entries) {
      if (!category) { setError("Choose a budget line."); return; }
      const amount = text.trim() ? parseAmountToMinor(text, home) : 0;
      if (amount === null) { setError(`Check the amount for ${category}.`); return; }
      if (amount !== current(category) || isNew) rows.push({ wedding_id: weddingId, category, amount_minor: amount });
    }
    setBusy(true);
    const { error } = rows.length ? await supabaseBrowser().from("budgets").upsert(rows, { onConflict: "wedding_id,category" }) : { error: null };
    setBusy(false);
    if (error) { setError("We couldn't save that just now. Try again."); return; }
    setError(undefined);
    onDone();
  }

  return (
    <Sheet open={target !== null} title={isNew ? "Add a budget line" : group?.name ?? ""} onClose={() => { setError(undefined); onClose(); }}>
      <form className="tn-stack" onSubmit={save} noValidate key={isNew ? "new" : group?.name}>
        {isNew ? (
          <>
            <div className="tn-field">
              <label className="tn-field-label" htmlFor="b-category">Budget line</label>
              <select id="b-category" name="category" className="tn-input" defaultValue="">
                <option value="">Choose a line</option>
                {GROUPS.map((g) => (
                  <optgroup key={g.name} label={g.name}>
                    {g.lines.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <TextField label={`Amount (${home})`} name="amount" inputMode="decimal" />
          </>
        ) : (
          groupLines.map((c) => (
            <TextField key={c} label={`${c} (${home})`} name={c} inputMode="decimal" defaultValue={current(c) ? minorToInput(current(c), home) : ""} />
          ))
        )}
        {error ? <p className="tn-alert" role="alert">{error}</p> : null}
        <Button type="submit" block disabled={busy}>{busy ? "Saving…" : "Save budget"}</Button>
      </form>
    </Sheet>
  );
}
