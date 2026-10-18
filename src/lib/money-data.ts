import "server-only";
import { loadWedding } from "@/lib/wedding.ts";
import { PAYMENT_COLUMNS, type Payment } from "@/lib/payments.ts";
import type { RateRow } from "@/lib/rates.ts";
import type { Role } from "@/lib/roles.ts";
import type { BookingConfirmation, ContractCheck } from "@/lib/protection.ts";

export type PersonOption = { id: string; name: string; role: Role; payer_currency: string | null };

// Everything the money screens need. Row-level security decides what comes back for each role.
export async function loadMoney(weddingId: string) {
  const ctx = await loadWedding(weddingId);
  const { supabase, wedding } = ctx;
  const [payments, budgets, people, suppliers, checks, bookings] = await Promise.all([
    supabase.from("payments").select(PAYMENT_COLUMNS).eq("wedding_id", weddingId).order("due_on", { ascending: true, nullsFirst: false }),
    supabase.from("budgets").select("category, amount_minor").eq("wedding_id", weddingId),
    supabase.from("members").select("id, display_name, role, payer_currency").eq("wedding_id", weddingId).eq("status", "active").order("created_at"),
    supabase.from("suppliers").select("id, name").eq("wedding_id", weddingId),
    // Family get none of these back; only the couple and planner see what suppliers have in place.
    supabase.from("contract_checks").select("supplier_id, clauses, checked_at").eq("wedding_id", weddingId),
    supabase.from("booking_confirmations").select("supplier_id, arrive_at, confirmed_on").eq("wedding_id", weddingId),
  ]);
  const rows = (payments.data ?? []) as Payment[];
  const currencies = [...new Set([wedding.home_currency, ...rows.map((p) => p.currency), ...rows.map((p) => p.locked_home_currency).filter(Boolean) as string[],
    ...(people.data ?? []).map((m) => m.payer_currency).filter(Boolean) as string[]])].filter((c) => c !== "GBP");
  const rates = currencies.length
    ? await supabase.from("rates").select("on_date, currency, per_gbp").in("currency", currencies).order("on_date")
    : { data: [] as RateRow[] };
  return {
    ...ctx,
    payments: rows,
    budgets: (budgets.data ?? []) as { category: string; amount_minor: number }[],
    people: (people.data ?? []).map((m) => ({ id: m.id, name: m.display_name, role: m.role, payer_currency: m.payer_currency })) as PersonOption[],
    suppliers: (suppliers.data ?? []) as { id: string; name: string }[],
    checks: (checks.data ?? []) as ContractCheck[],
    bookings: (bookings.data ?? []) as BookingConfirmation[],
    rates: (rates.data ?? []) as RateRow[],
  };
}
