import { Mark } from "@/components/ui";
import { SetupForm } from "./SetupForm";
import styles from "./welcome.module.css";

export default function WelcomePage() {
  return (
    <main className={styles.screen}>
      <header className={styles.brand}>
        <Mark size={48} />
        <div className={styles.brandText}>
          <span className="tn-wordmark">tondolo</span>
          <span className={styles.tagline}>Take the sour out of wedding money.</span>
        </div>
      </header>
      <div className={styles.intro}>
        <h1 className="tn-title">Let&rsquo;s set up your wedding</h1>
        <p className={styles.lead}>A few quick questions, then add your first quote or invoice.</p>
      </div>
      <SetupForm />
    </main>
  );
}
