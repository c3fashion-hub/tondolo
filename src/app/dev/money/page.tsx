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
import { Settings } from "@/app/w/[id]/settings/Settings";
import { can } from "@/lib/roles.ts";
import { NotesView } from "@/app/w/[id]/notes/NotesView";
import { BriefingView } from "@/app/w/[id]/briefing/BriefingView";
import {
  BOOKINGS, BUDGETS, CONTRACT_CHECKS, DESTINATION, NOTES, PAYMENTS, PEOPLE, RATES, REMINDERS, SUPPLIERS, TODAY, WEDDING_DATE,
} from "@/lib/example/wedding.ts";
import styles from "@/app/w/[id]/shell.module.css";

// Local preview of the money screens with the example wedding. Never served on the live site.
// ?screen=overview | first | health | budget | cash | scan | contract | settings | notes | briefing | supplier&id=s-rita, or payments by default.
export default async function MoneyPreview({ searchParams }: { searchParams: Promise<{ screen?: string; id?: string }> }) {
  const { screen, id } = await searchParams; // read first, so this page is built per request
  if (process.env.TONDOLO_PREVIEW !== "1") notFound();
  const common = {
    weddingId: "example", home: "GBP", today: TODAY, destination: DESTINATION, weddingDate: WEDDING_DATE,
    payments: PAYMENTS, budgets: BUDGETS, suppliers: SUPPLIERS, checks: CONTRACT_CHECKS, bookings: BOOKINGS, rates: RATES,
  };
  let view;
  if (screen === "overview") view = <OverviewView {...common} names="Ade & Sam" couple unlocked preview />;
  else if (screen === "first") view = <OverviewView {...common} names="Ade & Sam" couple payments={[]} />;
  else if (screen === "health") view = <HealthView {...common} />;
  else if (screen === "scan" || screen === "contract") view = <ScanPreview mode={screen} />;
  else if (screen === "settings") {
    const wedding = { id: "example", home_currency: "GBP", wedding_date: WEDDING_DATE, destination: DESTINATION, names: "Ade & Sam", rough_budget_minor: 5_800_000, starter_used: true, unlocked_at: "2026-10-01" };
    const members = PEOPLE.map((m) => ({ id: m.id, user_id: m.id, role: m.role, status: "active" as const, display_name: m.name, invite_email: null, invite_expires_at: null, payer_currency: m.payer_currency }));
    view = <Settings wedding={wedding} me={members[0]} members={members} myEmail="ade@example.com" rights={can("owner")} today={TODAY} preview
      checkin={{ day: 7, at_time: "19:00", second_day: 3, time_zone: "Europe/London" }} emails={{ reminders: true, weekly: false }} />;
  }
  else if (screen === "notes") view = <NotesView weddingId="example" home="GBP" today={TODAY} unlocked notes={NOTES} reminders={REMINDERS} suppliers={SUPPLIERS} payments={PAYMENTS} preview />;
  else if (screen === "briefing") {
    view = <BriefingView {...common} name="Ade" meId="m-ade" unlocked people={PEOPLE} reminders={REMINDERS} preview closeHref="/dev/money?screen=overview"
      checkin={{ day: 7, at_time: "19:00", second_day: 3, time_zone: "Europe/London" }} />;
  }
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
