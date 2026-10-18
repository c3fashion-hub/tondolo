"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { supabaseBrowser } from "@/lib/supabase/client.ts";

const ERRORS: Record<string, string> = {
  not_confirmed: "Type the word delete to confirm.",
  not_owner: "Only the person who set up this wedding can delete it.",
  owner_of_wedding: "You set up a wedding, so delete that wedding first (Settings, Delete everything). That deletes your account too.",
};

// Deleting the whole wedding (the owner) or your own account (anyone else). Both can't be undone,
// so the person types "delete" first, and is offered the spreadsheet before anything goes.
export function DeleteSheet({ open, mode, weddingId, names, onClose, preview }: {
  open: boolean; mode: "wedding" | "account"; weddingId: string; names: string | null; onClose: () => void; preview?: boolean;
}) {
  const router = useRouter();
  const [word, setWord] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const wedding = names ? `${names}’s wedding` : "this wedding";

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (word.trim().toLowerCase() !== "delete") { setError(ERRORS.not_confirmed); return; }
    if (preview) { setError("This is the preview, so nothing was deleted."); return; }
    setBusy(true); setError("");
    const supabase = supabaseBrowser();
    const { error: err } = mode === "wedding"
      ? await supabase.rpc("delete_wedding", { p_wedding: weddingId, p_confirm: word })
      : await supabase.rpc("delete_my_account", { p_confirm: word });
    if (err) {
      setBusy(false);
      const code = Object.keys(ERRORS).find((k) => err.message.includes(k));
      setError(code ? ERRORS[code] : "We couldn't delete that just now. Nothing has changed. Try again.");
      return;
    }
    await supabase.auth.signOut();
    router.replace("/?deleted=1");
    router.refresh();
  }

  return (
    <Sheet open={open} title={mode === "wedding" ? "Delete everything" : "Delete your account"} onClose={onClose}>
      <form className="tn-stack" onSubmit={confirm} noValidate>
        {mode === "wedding" ? (
          <>
            <p>This deletes {wedding} for everyone: every payment, budget, supplier, document, note and reminder, and the accounts of everyone on it who isn&rsquo;t part of another wedding. Uploaded files are removed within the hour.</p>
            <p><b>It can&rsquo;t be undone.</b> Stripe keeps its own record of your payment for Tondolo, as the law requires.</p>
          </>
        ) : (
          <>
            <p>This deletes your account and your sign-in. You&rsquo;ll lose access to {wedding}. The payments you added stay with the couple.</p>
            <p><b>It can&rsquo;t be undone.</b></p>
          </>
        )}
        <a href={`/w/${weddingId}/export`} download className="tn-btn tn-btn-secondary tn-btn-md tn-btn-block">Download a spreadsheet first</a>
        <TextField label="Type delete to confirm" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="none"
          error={error || undefined} />
        <Button type="submit" block disabled={busy}>{busy ? "Deleting…" : mode === "wedding" ? "Delete everything" : "Delete my account"}</Button>
      </form>
    </Sheet>
  );
}
