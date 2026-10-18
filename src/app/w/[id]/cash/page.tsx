import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadMoney } from "@/lib/money-data.ts";
import { can } from "@/lib/roles.ts";
import { todayIn } from "@/lib/dates.ts";
import { CashView } from "./CashView";

export const metadata: Metadata = { title: "Cash for the day" };

export default async function CashPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadMoney(id);
  if (!can(data.me.role).seeAllPayments) notFound(); // the couple and planner see every payment; family only their own
  return (
    <CashView weddingId={id} payments={data.payments} home={data.wedding.home_currency} weddingDate={data.wedding.wedding_date}
      destination={data.wedding.destination} today={todayIn()} rates={data.rates} />
  );
}
