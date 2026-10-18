"use client";

import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, TextField } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { LANGUAGES } from "@/lib/messages.ts";
import type { Language, Supplier } from "@/lib/protection.ts";

const PHONE = /^\+?[0-9 ()-]{6,24}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// The supplier's details: who to write to, how, and in which language.
export function SupplierSheet({ open, supplier, onClose, onDone }: { open: boolean; supplier: Supplier; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    legal_name: supplier.legal_name ?? "", contact_name: supplier.contact_name ?? "", phone: supplier.phone ?? "", email: supplier.email ?? "",
    language: (supplier.language ?? "en") as Language,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.phone.trim() && !PHONE.test(f.phone.trim())) errs.phone = "Enter the number with its country code, for example +351 912 345 678.";
    if (f.email.trim() && !EMAIL.test(f.email.trim())) errs.email = "Enter an email address like name@example.com.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const blank = (v: string) => v.trim() || null;
    const { error } = await supabaseBrowser().from("suppliers").update({
      legal_name: blank(f.legal_name), contact_name: blank(f.contact_name), phone: blank(f.phone), email: blank(f.email), language: f.language,
    }).eq("id", supplier.id);
    setBusy(false);
    if (error) { setErrors({ form: "We couldn't save that just now. Try again." }); return; }
    onDone();
  }

  return (
    <Sheet open={open} title="Supplier details" onClose={onClose}>
      <form className="tn-stack" onSubmit={save} noValidate>
        <TextField label="Contact name" value={f.contact_name} onChange={set("contact_name")} autoComplete="off" />
        <TextField label="WhatsApp or phone number" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} error={errors.phone}
          hint="With the country code, so WhatsApp opens the right chat" />
        <TextField label="Email" type="email" inputMode="email" value={f.email} onChange={set("email")} error={errors.email} autoComplete="off" />
        <TextField label="Full legal business name (optional)" value={f.legal_name} onChange={set("legal_name")} hint="As written on their quote or invoice" />
        <div className="tn-field">
          <label className="tn-field-label" htmlFor="sup-lang">Language for messages</label>
          <select id="sup-lang" className="tn-input" value={f.language} onChange={set("language")}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        {errors.form ? <p className="tn-alert" role="alert">{errors.form}</p> : null}
        <Button type="submit" block disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </Sheet>
  );
}
