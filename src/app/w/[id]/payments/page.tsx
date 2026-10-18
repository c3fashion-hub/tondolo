import type { Metadata } from "next";
import { loadMoney } from "@/lib/money-data.ts";
import { can } from "@/lib/roles.ts";
import { todayIn } from "@/lib/dates.ts";
import { PaymentsView } from "./PaymentsView";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadMoney(id);
  return (
    <PaymentsView
      weddingId={id}
      home={data.wedding.home_currency}
      unlocked={data.wedding.unlocked_at !== null}
      payments={data.payments}
      people={data.people}
      suppliers={data.suppliers}
      rates={data.rates}
      me={{ id: data.me.id, role: data.me.role }}
      seeAll={can(data.me.role).seeAllPayments}
      today={todayIn()}
      weddingDate={data.wedding.wedding_date}
      checks={data.checks}
      bookings={data.bookings}
    />
  );
}
