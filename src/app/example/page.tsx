import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/ui";
import styles from "../holding.module.css";

export const metadata: Metadata = { title: "Example wedding" };

export default function ExamplePage() {
  return (
    <main className={styles.screen}>
      <Link href="/" className={styles.back}>‹ Back</Link>
      <Mark size={48} />
      <h1 className="tn-title">Ade and Sam&rsquo;s wedding in Porto</h1>
      <section className={styles.card}>
        <p>Soon you&rsquo;ll be able to look around a real-looking wedding here: every payment, the money health check and the weekly briefing.</p>
        <p className="tn-muted">We&rsquo;re still building it. Nothing you see here is your own data.</p>
      </section>
    </main>
  );
}
