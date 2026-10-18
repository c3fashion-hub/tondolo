import type { ReactNode } from "react";

export type Tone = "paid" | "due" | "estimate" | "risk" | "neutral";

// Statuses always carry words; the colour only supports them.
export function StatusChip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tn-chip tn-chip-${tone}`}>{children}</span>;
}
