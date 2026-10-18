"use client";

import { useState } from "react";
import { Button, buttonClass } from "@/components/ui";
import type { Role } from "@/lib/roles.ts";
import styles from "./settings.module.css";

const SEES: Record<Exclude<Role, "owner">, string> = {
  partner: "see everything",
  planner: "see and add our payments",
  family: "see the payments you're covering",
};

export function inviteMessage(name: string, email: string, role: Exclude<Role, "owner">, link: string): string {
  return `Hello ${name}, I've added you to our wedding money in Tondolo, so you can ${SEES[role]}. Open this link and sign in with ${email}: ${link}`;
}

// The couple send the link themselves; Tondolo sends nothing on their behalf.
export function ShareInvite({ token, name, email, role }: { token: string; name: string; email: string; role: Exclude<Role, "owner"> }) {
  const link = `${window.location.origin}/invite/${token}`;
  const message = inviteMessage(name, email, role, link);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <div className="tn-stack">
      <p>Send {name} this link. It works once, for {email}, for 14 days.</p>
      <p className={styles.link} aria-label="Invite link">{link}</p>
      <div className={styles.share}>
        <a className={buttonClass({})} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a className={buttonClass({ variant: "secondary" })} href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Our wedding in Tondolo")}&body=${encodeURIComponent(message)}`}>Email</a>
      </div>
      <Button variant="secondary" block onClick={copy}>{copied ? "Link copied" : "Copy the link"}</Button>
      <p className="tn-small tn-muted" role="status">{copied ? "Paste it into any message." : "Copy it now: for safety we can't show this link again. If it's lost, make a new one from their invite."}</p>
    </div>
  );
}
