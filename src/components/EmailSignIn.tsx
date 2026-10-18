"use client";

import { useState, type FormEvent } from "react";
import { Button, TextField } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Step 1: email. Step 2: a 6-digit code (or tap the link in the email).
// The code matters for the home-screen app on iPhone, where email links open in Safari instead.
export function EmailSignIn({ next, submitLabel, emailHint, onSignedIn }: {
  next: string;
  submitLabel: string;
  emailHint?: string;
  onSignedIn: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) { setError("Enter your email address, like name@example.com."); return; }
    setBusy(true); setError(undefined);
    const confirmUrl = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: value, options: { shouldCreateUser: true, emailRedirectTo: confirmUrl } });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? "We've just sent you an email. Wait a minute, then try again." : "We couldn't send the email just now. Check the address and try again.");
      return;
    }
    setEmail(value);
    setStep("code");
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\D/g, "");
    if (token.length < 6) { setError("Enter the code from the email."); return; }
    setBusy(true); setError(undefined);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email, token, type: "email" });
    if (error) { setBusy(false); setError("That code didn't work. Check it, or ask for a new one."); return; }
    await onSignedIn();
  }

  if (step === "email") {
    return (
      <form className="tn-stack" onSubmit={sendCode} noValidate>
        <TextField label="Your email" name="email" type="email" inputMode="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} hint={emailHint ?? "We'll email you a sign-in link and a code. No password needed."} error={error} required />
        <Button type="submit" block disabled={busy}>{busy ? "Sending…" : submitLabel}</Button>
      </form>
    );
  }

  return (
    <form className="tn-stack" onSubmit={verify} noValidate>
      <p className="tn-note">We&rsquo;ve emailed <b>{email}</b>. Tap the link in the email, or type the code here.</p>
      <TextField label="Code from the email" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8}
        className="tn-input tn-code" error={error} required autoFocus />
      <Button type="submit" block disabled={busy}>{busy ? "Checking…" : "Continue"}</Button>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Button variant="link" onClick={() => sendCode()} disabled={busy}>Send a new code</Button>
        <Button variant="link" onClick={() => { setStep("email"); setError(undefined); }}>Use a different email</Button>
      </div>
    </form>
  );
}
