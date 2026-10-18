import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadMoney } from "@/lib/money-data.ts";
import { can } from "@/lib/roles.ts";
import { todayIn } from "@/lib/dates.ts";
import { HealthView } from "./HealthView";

export const metadata: Metadata = { title: "Money health check" };

export default async function HealthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadMoney(id);
  if (!can(data.me.role).seeAllPayments) notFound(); // family see overall progress only
  return (
    <HealthView weddingId={id} destination={data.wedding.destination} weddingDate={data.wedding.wedding_date}
      home={data.wedding.home_currency} today={todayIn()} payments={data.payments} budgets={data.budgets}
      suppliers={data.suppliers} checks={data.checks} bookings={data.bookings} rates={data.rates} />
  );
}
