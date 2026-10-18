import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/components/ui";
import { currentUser } from "@/lib/supabase/server.ts";
import { SetupForm } from "./SetupForm";
import styles from "./welcome.module.css";

export default async function WelcomePage() {
  const { supabase, user } = await currentUser();
  if (user) {
    const { data } = await supabase.from("members").select("wedding_id").eq("user_id", user.id).eq("status", "active").limit(1);
    if (data?.[0]) redirect(`/w/${data[0].wedding_id}`);
  }
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
      {user ? null : <p className={styles.signIn}>Already using Tondolo? <Link href="/sign-in">Sign in</Link></p>}
    </main>
  );
}
