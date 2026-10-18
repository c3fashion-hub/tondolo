import { notFound } from "next/navigation";
import { PaymentsView } from "@/app/w/[id]/payments/PaymentsView";
import { BudgetView } from "@/app/w/[id]/budget/BudgetView";
import { OverviewView } from "@/app/w/[id]/OverviewView";
import { HealthView } from "@/app/w/[id]/health/HealthView";
import {
  BOOKINGS, BUDGETS, CONTRACT_CHECKS, DESTINATION, PAYMENTS, PEOPLE, RATES, SUPPLIERS, TODAY, WEDDING_DATE,
} from "@/lib/example/wedding.ts";
import styles from "@/app/w/[id]/shell.module.css";

// Local preview of the money screens with the example wedding. Never served on the live site.
// ?screen=overview | first | health | budget, or payments by default.
export default async function MoneyPreview({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  const { screen } = await searchParams; // read first, so this page is built per request
  if (process.env.TONDOLO_PREVIEW !== "1") notFound();
  const common = {
    weddingId: "example", home: "GBP", today: TODAY, destination: DESTINATION, weddingDate: WEDDING_DATE,
    payments: PAYMENTS, budgets: BUDGETS, suppliers: SUPPLIERS, checks: CONTRACT_CHECKS, bookings: BOOKINGS, rates: RATES,
  };
  let view;
  if (screen === "overview") view = <OverviewView {...common} names="Ade & Sam" couple />;
  else if (screen === "first") view = <OverviewView {...common} names="Ade & Sam" couple payments={[]} />;
  else if (screen === "health") view = <HealthView {...common} />;
  else if (screen === "budget") view = <BudgetView weddingId="example" home="GBP" names="Ade & Sam" payments={PAYMENTS} budgets={BUDGETS} people={PEOPLE} rates={RATES} today={TODAY} />;
  else view = <PaymentsView {...common} unlocked people={PEOPLE} me={{ id: "m-ade", role: "owner" }} seeAll />;
  return (
    <div className={styles.shell}>
      <div className={styles.content}>{view}</div>
    </div>
  );
}
