import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadMoney } from "@/lib/money-data.ts";
import { can } from "@/lib/roles.ts";
import { todayIn } from "@/lib/dates.ts";
import { RateBook } from "@/lib/rates.ts";
import { protectionFor } from "@/lib/protection.ts";
import { SupplierView } from "./SupplierView";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const data = await loadMoney(id);
  if (!can(data.me.role).seeAllPayments) notFound(); // the couple and planner only
  const supplier = data.suppliers.find((s) => s.id === sid);
  if (!supplier) notFound();
  const today = todayIn();
  const home = data.wedding.home_currency;
  const protection = protectionFor(supplier, data.payments, data.checks, data.bookings, data.wedding.wedding_date, home, new RateBook(data.rates), today);
  return (
    <SupplierView weddingId={id} protection={protection} payments={data.payments.filter((p) => p.supplier_id === sid)}
      bookings={data.bookings.filter((b) => b.supplier_id === sid)} home={home} weddingDate={data.wedding.wedding_date}
      destination={data.wedding.destination} today={today} rates={data.rates}
      documents={data.documents.filter((d) => d.supplier_id === sid)} suppliers={data.suppliers} />
  );
}
