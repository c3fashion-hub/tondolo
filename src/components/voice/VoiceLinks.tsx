"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui";
import { AskSheet } from "./AskSheet";

// On the Overview: play this week's briefing (the couple) and ask a question (the couple and planner).
export function VoiceLinks({ weddingId, couple, preview = false }: { weddingId: string; couple: boolean; preview?: boolean }) {
  const [asking, setAsking] = useState(false);
  return (
    <section className="tn-stack" aria-label="Briefing and questions" style={{ gap: 10 }}>
      {couple ? (
        <Link href={preview ? "/dev/money?screen=briefing" : `/w/${weddingId}/briefing`} className={buttonClass({ block: true })}>
          Play this week&rsquo;s briefing
        </Link>
      ) : null}
      <Button variant="secondary" block icon="mic" onClick={() => setAsking(true)}>Ask a question</Button>
      <AskSheet weddingId={weddingId} open={asking} onClose={() => setAsking(false)} preview={preview} />
    </section>
  );
}
