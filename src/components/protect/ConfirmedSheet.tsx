"use client";

import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, TextField } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import type { BookingConfirmation, Supplier } from "@/lib/protection.ts";

// Records that the supplier replied "Confirmed", with their words as evidence for the claim pack.
export function ConfirmedSheet({ open, weddingId, supplier, booking, today, onClose, onDone }: {
  open: boolean; weddingId: string; supplier: Supplier; booking: BookingConfirmation | null; today: string;
  onClose: () => void; onDone: () => void;
}) {
  const [on, setOn] = useState(today);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const db = supabaseBrowser().from("booking_confirmations");
    const fields = { confirmed_on: on || today, reply_evidence: reply.trim() || null };
    const { error } = booking?.id
      ? await db.update(fields).eq("id", booking.id)
      : await db.insert({ wedding_id: weddingId, supplier_id: supplier.id, ...fields });
    setBusy(false);
    if (error) { setError("We couldn't save that just now. Try again."); return; }
    onDone();
  }

  return (
    <Sheet open={open} title="They've confirmed" onClose={onClose}>
      <form className="tn-stack" onSubmit={save} noValidate>
        <p>Great. Note when {supplier.contact_name ?? supplier.name} confirmed, and paste their reply if you like.</p>
        <TextField label="Date confirmed" type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} />
        <div className="tn-field">
          <label className="tn-field-label" htmlFor="reply">Their reply (optional)</label>
          <textarea id="reply" className="tn-input" style={{ padding: "10px 12px", minHeight: 88 }} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} />
        </div>
        <p className="tn-small tn-muted">Keep the screenshot with your receipts too. It&rsquo;s your written record.</p>
        {error ? <p className="tn-alert" role="alert">{error}</p> : null}
        <Button type="submit" block disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </Sheet>
  );
}
