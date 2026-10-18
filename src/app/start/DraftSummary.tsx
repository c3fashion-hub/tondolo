"use client";

import { useSyncExternalStore } from "react";
import { loadSetupDraft } from "@/lib/setup-draft.ts";
import { formatMinor } from "@/lib/money.ts";
import styles from "../holding.module.css";

const noop = () => () => {};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function DraftSummary() {
  const raw = useSyncExternalStore(noop, () => JSON.stringify(loadSetupDraft()), () => "null");
  const draft = JSON.parse(raw) as ReturnType<typeof loadSetupDraft>;
  if (!draft) return <p className="tn-muted">We couldn&rsquo;t find your answers on this phone. Go back and fill them in again.</p>;
  return (
    <ul className={styles.list}>
      {draft.names ? <li><b>{draft.names}</b></li> : null}
      <li>{draft.destination} · {formatDate(draft.weddingDate)}</li>
      <li>Totals in {draft.homeCurrency}</li>
      {draft.roughBudgetMinor ? <li>Rough budget {formatMinor(draft.roughBudgetMinor, draft.homeCurrency)}</li> : null}
      <li>{draft.useStarterBudget ? "Starting with the standard budget" : "Starting with a blank budget"}</li>
    </ul>
  );
}
