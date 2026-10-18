import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server.ts";
import type { MemberStatus, Role } from "@/lib/roles.ts";

export type Wedding = {
  id: string; home_currency: string; wedding_date: string; destination: string;
  names: string | null; rough_budget_minor: number | null; starter_used: boolean; unlocked_at: string | null;
};
export type Member = {
  id: string; user_id: string | null; role: Role; status: MemberStatus; display_name: string;
  invite_email: string | null; invite_expires_at: string | null; payer_currency: string | null;
};

// The wedding and the signed-in person's place in it. Row-level security decides what comes back.
export const loadWedding = cache(async (id: string) => {
  const { supabase, user } = await currentUser();
  if (!user) redirect(`/sign-in`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: wedding }, { data: me }] = await Promise.all([
    supabase.from("weddings").select("id, home_currency, wedding_date, destination, names, rough_budget_minor, starter_used, unlocked_at").eq("id", id).maybeSingle(),
    supabase.from("members").select("id, user_id, role, status, display_name, invite_email, invite_expires_at, payer_currency").eq("wedding_id", id).eq("user_id", user.id).eq("status", "active").maybeSingle(),
  ]);
  if (!wedding || !me) notFound();
  return { supabase, user, wedding: wedding as Wedding, me: me as Member };
});
