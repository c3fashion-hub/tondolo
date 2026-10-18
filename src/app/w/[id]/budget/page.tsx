import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/ComingSoon";
import { loadWedding } from "@/lib/wedding.ts";
import { can } from "@/lib/roles.ts";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { me } = await loadWedding((await params).id);
  if (!can(me.role).seeBudget) notFound();
  return <ComingSoon title="Budget" what="Soon you'll set what you want to spend on each part of the day, and see what's committed against it." />;
}
