import { notFound } from "next/navigation";
import { PaymentsView } from "@/app/w/[id]/payments/PaymentsView";
import { BudgetView } from "@/app/w/[id]/budget/BudgetView";
import { OverviewView } from "@/app/w/[id]/OverviewView";
import { HealthView } from "@/app/w/[id]/health/HealthView";
import { SupplierView } from "@/app/w/[id]/suppliers/[sid]/SupplierView";
import { CashView } from "@/app/w/[id]/cash/CashView";
import { RateBook } from "@/lib/rates.ts";
import { protectionFor } from "@/lib/protection.ts";
import { ScanPreview } from "./ScanPreview";
import {
  BOOKINGS, BUDGETS, CONTRACT_CHECKS, DESTINATION, PAYMENTS, PEOPLE, RATES, SUPPLIERS, TODAY, WEDDING_DATE,
} from "@/lib/example/wedding.ts";
import styles from "@/app/w/[id]/shell.module.css";

// Local preview of the money screens with the example wedding. Never served on the live site.
// ?screen=overview | first | health | budget | cash | scan | contract | supplier&id=s-rita, or payments by default.
export default async function MoneyPreview({ searchParams }: { searchParams: Promise<{ screen?: string; id?: string }> }) {
  const { screen, id } = await searchParams; // read first, so this page is built per request
  if (process.env.TONDOLO_PREVIEW !== "1") notFound();
  const common = {
    weddingId: "example", home: "GBP", today: TODAY, destination: DESTINATION, weddingDate: WEDDING_DATE,
    payments: PAYMENTS, budgets: BUDGETS, suppliers: SUPPLIERS, checks: CONTRACT_CHECKS, bookings: BOOKINGS, rates: RATES,
  };
  let view;
  if (screen === "overview") view = <OverviewView {...common} names="Ade & Sam" couple />;
  else if (screen === "first") view = <OverviewView {...common} names="Ade & Sam" couple payments={[]} />;
  else if (screen === "health") view = <HealthView {...common} />;
  else if (screen === "scan" || screen === "contract") view = <ScanPreview mode={screen} />;
  else if (screen === "cash") view = <CashView {...common} preview />;
  else if (screen === "supplier") {
    const sup = SUPPLIERS.find((x) => x.id === id) ?? SUPPLIERS[0];
    const protection = protectionFor(sup, PAYMENTS, CONTRACT_CHECKS, BOOKINGS, WEDDING_DATE, "GBP", new RateBook(RATES), TODAY);
    view = <SupplierView {...common} protection={protection} payments={PAYMENTS.filter((p) => p.supplier_id === sup.id)}
      bookings={BOOKINGS.filter((b) => b.supplier_id === sup.id)} documents={[]} suppliers={SUPPLIERS} preview />;
  }
  else if (screen === "budget") view = <BudgetView weddingId="example" home="GBP" names="Ade & Sam" payments={PAYMENTS} budgets={BUDGETS} people={PEOPLE} rates={RATES} today={TODAY} />;
  else view = <PaymentsView {...common} unlocked people={PEOPLE} me={{ id: "m-ade", role: "owner" }} seeAll />;
  return (
    <div className={styles.shell}>
      <div className={styles.content}>{view}</div>
    </div>
  );
}
