import { notFound } from "next/navigation";
import { PaymentsView } from "@/app/w/[id]/payments/PaymentsView";
import { BudgetView } from "@/app/w/[id]/budget/BudgetView";
import { BUDGETS, PAYMENTS, PEOPLE, RATES, TODAY } from "@/lib/example/wedding.ts";
import styles from "@/app/w/[id]/shell.module.css";

// Local preview of the money screens with the example wedding. Never served on the live site.
export default async function MoneyPreview({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  const { screen } = await searchParams; // read first, so this page is built per request
  if (process.env.TONDOLO_PREVIEW !== "1") notFound();
  return (
    <div className={styles.shell}>
      <div className={styles.content}>
        {screen === "budget"
          ? <BudgetView weddingId="example" home="GBP" names="Ade & Sam" payments={PAYMENTS} budgets={BUDGETS} people={PEOPLE} rates={RATES} today={TODAY} />
          : <PaymentsView weddingId="example" home="GBP" unlocked payments={PAYMENTS} people={PEOPLE} suppliers={[]} rates={RATES}
              me={{ id: "m-ade", role: "owner" }} seeAll today={TODAY} />}
      </div>
    </div>
  );
}
