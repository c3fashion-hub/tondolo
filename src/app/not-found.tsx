import Link from "next/link";
import styles from "./holding.module.css";

export default function NotFound() {
  return (
    <main className={styles.screen}>
      <h1 className="tn-title">We can&rsquo;t find that page</h1>
      <p className="tn-muted">It may have moved. Your wedding is still where you left it.</p>
      <Link href="/" className={styles.back}>Go to the start</Link>
    </main>
  );
}
