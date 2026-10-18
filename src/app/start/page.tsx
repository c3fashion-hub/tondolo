import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/ui";
import { DraftSummary } from "./DraftSummary";
import styles from "../holding.module.css";

export const metadata: Metadata = { title: "Your wedding" };

export default function StartPage() {
  return (
    <main className={styles.screen}>
      <Link href="/" className={styles.back}>‹ Change your answers</Link>
      <Mark size={48} />
      <h1 className="tn-title">Lovely. Here&rsquo;s your wedding.</h1>
      <DraftSummary />
      <section className={styles.card}>
        <h2 className="tn-heading">Next: sign in with your email</h2>
        <p className="tn-muted">You&rsquo;ll get a link by email, so there&rsquo;s no password to remember. Signing in saves your wedding and lets you share it with your partner.</p>
        <p className="tn-muted">We&rsquo;re still building this part. Your answers are kept on this phone until then.</p>
      </section>
    </main>
  );
}
