"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import styles from "./settings.module.css";

const TEST_ERRORS: Record<string, string> = {
  not_configured: "Email isn't switched on yet. Once it is, reminders start the next morning.",
  too_many: "That's a few tests already. Try again in an hour.",
  not_allowed: "Only the couple and the planner can have reminder emails for now.",
};

// Each person chooses their own emails. Nobody turns emails on for someone else.
export function EmailChoices({ weddingId, email, reminders: r0, weekly: w0, family, preview }: {
  weddingId: string; email: string; reminders: boolean; weekly: boolean; family: boolean; preview?: boolean;
}) {
  const [reminders, setReminders] = useState(r0);
  const [weekly, setWeekly] = useState(w0);
  const [status, setStatus] = useState("");

  if (family) {
    return <p className="tn-small tn-muted">Email reminders for family members are coming soon. The couple can see every due date in the app.</p>;
  }

  async function save(nextReminders: boolean, nextWeekly: boolean) {
    setReminders(nextReminders); setWeekly(nextWeekly);
    if (preview) return;
    const { error } = await supabaseBrowser().rpc("set_my_emails", { p_wedding: weddingId, p_reminders: nextReminders, p_weekly: nextWeekly });
    setStatus(error ? "We couldn't save that just now. Try again." : "Saved.");
  }

  async function test() {
    setStatus("Sending…");
    if (preview) { setStatus(`Sent to ${email}. It should arrive in a minute.`); return; }
    const { data, error } = await supabaseBrowser().functions.invoke("send-reminders", { body: { test: true, wedding_id: weddingId } });
    if (error) {
      let code = "busy";
      if (error instanceof FunctionsHttpError) { try { code = (await error.context.json()).error ?? "busy"; } catch { /* keep busy */ } }
      setStatus(TEST_ERRORS[code] ?? "We couldn't send that just now. Try again in a minute.");
      return;
    }
    setStatus(`Sent to ${data?.to ?? email}. It should arrive in a minute.`);
  }

  return (
    <div className="tn-stack" style={{ gap: 8 }}>
      <label className={styles.toggle}>
        <input type="checkbox" checked={reminders} onChange={(e) => save(e.target.checked, weekly)} />
        <span><b>Payment reminders</b><span className="tn-small tn-muted">An email 14 days and 3 days before each due date.</span></span>
      </label>
      <label className={styles.toggle}>
        <input type="checkbox" checked={weekly} onChange={(e) => save(reminders, e.target.checked)} />
        <span><b>Weekly summary</b><span className="tn-small tn-muted">Days to go, what&rsquo;s due next and your totals, on the morning of your check-in day.</span></span>
      </label>
      <p className="tn-small tn-muted">Emails go to {email}.</p>
      <Button variant="secondary" block onClick={test}>Send me a test reminder</Button>
      <p className="tn-small" role="status" style={{ margin: 0 }}>{status}</p>
    </div>
  );
}
