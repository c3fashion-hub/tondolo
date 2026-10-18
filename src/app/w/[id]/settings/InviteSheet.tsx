"use client";

import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, TextField } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { CURRENCIES } from "@/lib/currencies.ts";
import { ROLE_INVITE_HELP, ROLE_LABEL, seatsLeft, type Role } from "@/lib/roles.ts";
import type { Member } from "@/lib/wedding.ts";
import { ShareInvite } from "./ShareInvite";
import styles from "./settings.module.css";

type Invitable = Exclude<Role, "owner">;
const ORDER: Invitable[] = ["partner", "planner", "family"];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function inviteError(message: string, email: string): string {
  if (message.includes("seat_full")) return "That place is already taken. Remove someone first, or choose another role.";
  if (message.includes("already_member")) return `${email} is already in your wedding.`;
  if (message.includes("members_one_invite_per_email")) return `You've already invited ${email}. Use Change on their invite to make a new link.`;
  if (message.includes("bad_email")) return "Enter their email address, like name@example.com.";
  return "We couldn't make the invite just now. Try again.";
}

export function InviteSheet({ open, weddingId, members, onClose, onInvited }: {
  open: boolean; weddingId: string; members: Member[]; onClose: () => void; onInvited: () => void;
}) {
  const left = seatsLeft(members);
  const firstFree = ORDER.find((r) => left[r] > 0);
  const [role, setRole] = useState<Invitable | undefined>(firstFree);
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ token: string; name: string; email: string; role: Invitable } | null>(null);

  function reset() { setSent(null); setErrors({}); setRole(firstFree); onClose(); }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const next: typeof errors = {};
    if (!name) next.name = "Add their name, as you'd like it shown.";
    if (!EMAIL.test(email)) next.email = "Enter their email address, like name@example.com.";
    if (!role) next.form = "All five places are taken.";
    setErrors(next);
    if (Object.keys(next).length || !role) return;
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("invite_member", {
      p_wedding: weddingId, p_role: role, p_display_name: name, p_email: email,
      p_payer_currency: role === "family" ? String(f.get("payerCurrency") ?? "") : null,
    });
    setBusy(false);
    if (error || !data) { setErrors({ form: inviteError(error?.message ?? "", email) }); return; }
    setSent({ token: data as string, name, email, role });
    onInvited();
  }

  return (
    <Sheet open={open} title={sent ? "Send your invite" : "Invite someone"} onClose={reset} closeLabel={sent ? "Done" : "Close"}>
      {sent ? (
        <ShareInvite token={sent.token} name={sent.name} email={sent.email} role={sent.role} />
      ) : !firstFree ? (
        <p>All five places are taken: two partners, one planner and two family members. Remove someone to invite someone new.</p>
      ) : (
        <form className="tn-stack" onSubmit={submit} noValidate>
          <TextField label="Their name" name="name" autoComplete="off" placeholder="e.g. Sam, or Mum" maxLength={60} error={errors.name} />
          <TextField label="Their email" name="email" type="email" inputMode="email" autoComplete="off" error={errors.email}
            hint="They'll sign in with this email, so the invite only works for them." />
          <fieldset className={styles.roles}>
            <legend>What they can see</legend>
            {ORDER.map((r) => (
              <label key={r} className={styles.role} data-disabled={left[r] === 0}>
                <input type="radio" name="role" value={r} checked={role === r} disabled={left[r] === 0} onChange={() => setRole(r)} />
                <span><b>{ROLE_LABEL[r]}{left[r] === 0 ? " (place taken)" : ""}</b>{ROLE_INVITE_HELP[r]}</span>
              </label>
            ))}
          </fieldset>
          {role === "family" ? (
            <div className="tn-field">
              <label className="tn-field-label" htmlFor="payerCurrency">Which currency do they pay from?</label>
              <select id="payerCurrency" name="payerCurrency" className="tn-input" defaultValue="GBP" aria-describedby="payerCurrency-hint">
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.name}</option>)}
              </select>
              <em id="payerCurrency-hint" className="tn-field-hint">We&rsquo;ll show their contribution in this currency too.</em>
            </div>
          ) : null}
          {errors.form ? <p className="tn-alert" role="alert">{errors.form}</p> : null}
          <Button type="submit" block disabled={busy}>{busy ? "Making the invite…" : "Make an invite link"}</Button>
          <p className="tn-small tn-muted">You send the link yourself, by WhatsApp, message or email. Tondolo doesn&rsquo;t contact anyone for you.</p>
        </form>
      )}
    </Sheet>
  );
}
