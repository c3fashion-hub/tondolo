import type { Metadata } from "next";
import { loadWedding, type Member } from "@/lib/wedding.ts";
import { can } from "@/lib/roles.ts";
import { Settings } from "./Settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, wedding, me } = await loadWedding(id);
  const { data } = await supabase
    .from("members")
    .select("id, user_id, role, status, display_name, invite_email, invite_expires_at, payer_currency")
    .eq("wedding_id", id)
    .neq("status", "removed")
    .order("created_at");
  return <Settings wedding={wedding} me={me} members={(data ?? []) as Member[]} myEmail={user.email ?? ""} rights={can(me.role)} />;
}
