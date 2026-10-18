"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { clearSetupDraft, loadSetupDraft } from "@/lib/setup-draft.ts";
import { firstNameFrom } from "@/lib/roles.ts";

type State = "saving" | "no-draft" | "error";

// Turns the answers kept on this phone into a saved wedding, then opens it.
export function FinishSetup() {
  const router = useRouter();
  const [state, setState] = useState<State>("saving");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/sign-in"); return; }
      const draft = loadSetupDraft();
      if (!draft) { setState("no-draft"); return; }
      const { data, error } = await supabase.rpc("create_wedding", {
        p_home_currency: draft.homeCurrency,
        p_wedding_date: draft.weddingDate,
        p_destination: draft.destination,
        p_names: draft.names,
        p_rough_budget_minor: draft.roughBudgetMinor,
        p_starter_used: draft.useStarterBudget,
        p_display_name: firstNameFrom(draft.names, user.email ?? ""),
      });
      if (error || !data) { setState("error"); return; }
      clearSetupDraft();
      router.replace(`/w/${data}`);
    })();
  }, [router]);

  if (state === "saving") return <p role="status" className="tn-muted">Saving your wedding…</p>;
  if (state === "error") {
    return (
      <div className="tn-stack">
        <h1 className="tn-title">That didn&rsquo;t save</h1>
        <p className="tn-muted">Something went wrong on our side. Your answers are still on this phone, so try again.</p>
        <button type="button" className={buttonClass({ block: true })} onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  return (
    <div className="tn-stack">
      <h1 className="tn-title">You&rsquo;re signed in</h1>
      <p className="tn-muted">We couldn&rsquo;t find your setup answers in this browser. If you started on another phone or in the home-screen app, carry on there. Or set up your wedding here.</p>
      <Link href="/home" className={buttonClass({ block: true })}>Go to my wedding</Link>
      <Link href="/" className={buttonClass({ variant: "secondary", block: true })}>Set up a wedding here</Link>
    </div>
  );
}
