"use client";

import { useEffect, useState, type FormEvent } from "react";
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

export function MemberSheet({ member, members, onClose, onDone }: { member: Member | null; members: Member[]; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<Invitable>("family");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member && member.role !== "owner") setRole(member.role);
    setConfirmRemove(false); setNewToken(null); setError(undefined);
  }, [member]);

  if (!member || member.role === "owner") return <Sheet open={false} title="" onClose={onClose}>{null}</Sheet>;
  const others = members.filter((m) => m.id !== member.id);
  const left = seatsLeft(others);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!member) return;
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) { setError("Add their name."); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("update_member", {
      p_member: member.id, p_role: role, p_display_name: name,
      p_payer_currency: role === "family" ? String(f.get("payerCurrency") ?? "") : null,
    });
    setBusy(false);
    if (error) { setError(error.message.includes("seat_full") ? "That place is already taken." : "We couldn't save that. Try again."); return; }
    onDone();
  }

  async function remove() {
    if (!member) return;
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("remove_member", { p_member: member.id });
    setBusy(false);
    if (error) { setError("We couldn't remove them just now. Try again."); return; }
    onDone();
  }

  async function reissue() {
    if (!member) return;
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("reissue_invite", { p_member: member.id });
    setBusy(false);
    if (error || !data) { setError("We couldn't make a new link. Try again."); return; }
    setNewToken(data as string);
  }

  if (newToken && member.invite_email) {
    return (
      <Sheet open title="Send the new link" onClose={onDone} closeLabel="Done">
        <ShareInvite token={newToken} name={member.display_name} email={member.invite_email} role={member.role as Invitable} />
      </Sheet>
    );
  }

  return (
    <Sheet open title={member.display_name} onClose={onClose}>
      {confirmRemove ? (
        <div className="tn-stack">
          <p>Remove {member.display_name}? {member.status === "invited" ? "Their invite link will stop working." : "They'll lose access straight away."}</p>
          <Button block onClick={remove} disabled={busy}>{busy ? "Removing…" : `Remove ${member.display_name}`}</Button>
          <Button variant="secondary" block onClick={() => setConfirmRemove(false)}>Keep them</Button>
        </div>
      ) : (
        <form className="tn-stack" onSubmit={save} noValidate>
          <TextField label="Name" name="name" defaultValue={member.display_name} maxLength={60} />
          <fieldset className={styles.roles}>
            <legend>What they can see</legend>
            {ORDER.map((r) => {
              const full = left[r] === 0 && member.role !== r;
              return (
                <label key={r} className={styles.role} data-disabled={full}>
                  <input type="radio" name="role" value={r} checked={role === r} disabled={full} onChange={() => setRole(r)} />
                  <span><b>{ROLE_LABEL[r]}{full ? " (place taken)" : ""}</b>{ROLE_INVITE_HELP[r]}</span>
                </label>
              );
            })}
          </fieldset>
          {role === "family" ? (
            <div className="tn-field">
              <label className="tn-field-label" htmlFor="m-payerCurrency">Which currency do they pay from?</label>
              <select id="m-payerCurrency" name="payerCurrency" className="tn-input" defaultValue={member.payer_currency ?? "GBP"}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.name}</option>)}
              </select>
            </div>
          ) : null}
          {error ? <p className="tn-alert" role="alert">{error}</p> : null}
          <Button type="submit" block disabled={busy}>Save changes</Button>
          {member.status === "invited" ? <Button variant="secondary" block onClick={reissue} disabled={busy}>Make a new invite link</Button> : null}
          <Button variant="secondary" block onClick={() => setConfirmRemove(true)}>Remove from your wedding</Button>
        </form>
      )}
    </Sheet>
  );
}
