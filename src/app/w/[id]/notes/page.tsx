import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/ComingSoon";
import { loadWedding } from "@/lib/wedding.ts";
import { can } from "@/lib/roles.ts";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { me } = await loadWedding((await params).id);
  if (!can(me.role).seeNotes) notFound();
  return <ComingSoon title="Notes" what="Soon you'll speak or type notes here, and we'll file the payments, times and reminders in them. Only the two of you can see notes." />;
}
