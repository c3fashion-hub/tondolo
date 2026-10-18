"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { EmailSignIn } from "@/components/EmailSignIn";
import { supabaseBrowser } from "@/lib/supabase/client.ts";

export function AcceptInvite({ token, signedInEmail, emailHint }: { token: string; signedInEmail: string | null; emailHint: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true); setError(undefined);
    const { data, error } = await supabaseBrowser().rpc("accept_invite", { p_token: token });
    if (error || !data) {
      setBusy(false);
      setError(error?.message.includes("invite_email_mismatch")
        ? `This invite was sent to ${emailHint}. Sign out, then sign in with that email.`
        : "This invite has expired or was already used. Ask for a new one.");
      router.refresh();
      return;
    }
    router.replace(`/w/${data}`);
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.refresh();
  }

  if (!signedInEmail) {
    return (
      <div className="tn-stack">
        <h2 className="tn-heading">Sign in to join</h2>
        <EmailSignIn next={`/invite/${token}`} submitLabel="Email me a sign-in code"
          emailHint={`Use the email this invite was sent to (${emailHint}). We'll email you a code. No password needed.`}
          onSignedIn={() => router.refresh()} />
      </div>
    );
  }

  return (
    <div className="tn-stack">
      <p className="tn-muted">Signed in as {signedInEmail}.</p>
      {error ? <p className="tn-alert" role="alert">{error}</p> : null}
      <Button block onClick={accept} disabled={busy}>{busy ? "Joining…" : "Join the wedding"}</Button>
      <Button variant="secondary" block onClick={signOut}>Not you? Sign out</Button>
    </div>
  );
}
