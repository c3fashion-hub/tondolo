import type { Metadata } from "next";
import { loadWedding } from "@/lib/wedding.ts";
import { currencyFor } from "@/lib/billing.ts";
import { UnlockView } from "./UnlockView";

export const metadata: Metadata = { title: "Unlock Tondolo" };

export default async function UnlockPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ session_id?: string; cancelled?: string }>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { supabase, wedding, me } = await loadWedding(id);
  const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("wedding_id", id).eq("is_estimate", false);
  return (
    <UnlockView weddingId={id} owner={me.role === "owner"} unlocked={wedding.unlocked_at !== null} used={count ?? 0}
      currency={currencyFor(wedding.home_currency)} sessionId={q.session_id ?? null} cancelled={q.cancelled === "1"} />
  );
}
