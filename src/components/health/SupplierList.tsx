import { PaymentRow, type Tone } from "@/components/ui";
import { formatMinor } from "@/lib/money.ts";
import { inPlaceSummary, type SupplierProtection } from "@/lib/protection.ts";
import styles from "./health.module.css";

// Never "protected": say what's in place and what's still needed.
export function supplierStatus(s: SupplierProtection, home: string): { label: string; tone: Tone } {
  if (s.atRisk > 0) return { label: `${formatMinor(s.atRisk, home, { whole: true })} at risk`, tone: "risk" };
  if (s.inPlace) return { label: "In place", tone: "paid" };
  return { label: s.level === 1 ? "Needs a contract check" : "Needs a confirmed booking", tone: "due" };
}

export function SupplierList({ suppliers, home }: { suppliers: SupplierProtection[]; home: string }) {
  const sorted = [...suppliers].sort((a, b) => b.atRisk - a.atRisk || a.level - b.level || b.committed - a.committed);
  return (
    <>
      {sorted.map((s) => {
        const st = supplierStatus(s, home);
        return (
          <div key={s.supplier.id} id={`s-${s.supplier.id}`} className={styles.anchor}>
            <PaymentRow title={s.supplier.name} status={st.label} tone={st.tone}
              detail={`Level ${s.level} · ${inPlaceSummary(s)}`}
              amount={formatMinor(s.committed, home, { whole: true })}
              converted={s.paid ? `${formatMinor(s.paid, home, { whole: true })} paid` : "nothing paid yet"} />
          </div>
        );
      })}
    </>
  );
}
