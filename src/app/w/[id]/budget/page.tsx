import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadMoney } from "@/lib/money-data.ts";
import { can } from "@/lib/roles.ts";
import { todayIn } from "@/lib/dates.ts";
import { BudgetView } from "./BudgetView";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadMoney(id);
  if (!can(data.me.role).seeBudget) notFound();
  return (
    <BudgetView weddingId={id} home={data.wedding.home_currency} names={data.wedding.names}
      payments={data.payments} budgets={data.budgets} people={data.people} rates={data.rates} today={todayIn()} />
  );
}
