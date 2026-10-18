import Link from "next/link";
import { Mark, StatusChip } from "@/components/ui";
import { LEGAL_APPROVED, LEGAL_UPDATED, type LegalSection } from "@/lib/legal.ts";
import styles from "./legal.module.css";

// A plain page for the privacy policy or terms. Until Mags approves the wording it says it's a draft.
export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand} aria-label="Tondolo home"><Mark size={32} /><span className="tn-wordmark">tondolo</span></Link>
      <h1 className="tn-title">{title}</h1>
      <p className="tn-small tn-muted">
        {LEGAL_APPROVED ? `Last updated ${LEGAL_UPDATED}.` : <StatusChip tone="due">Draft, not yet approved</StatusChip>}
      </p>
      {sections.map((s) => (
        <section key={s.heading} className={styles.section}>
          <h2 className="tn-heading">{s.heading}</h2>
          {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      ))}
      <p className="tn-small"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
    </main>
  );
}
