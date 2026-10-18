import "server-only";
import { loadWedding } from "@/lib/wedding.ts";
import { PAYMENT_COLUMNS, type Payment } from "@/lib/payments.ts";
import type { RateRow } from "@/lib/rates.ts";
import type { Role } from "@/lib/roles.ts";
import type { BookingConfirmation, ContractCheck, Supplier } from "@/lib/protection.ts";

export type DocumentRow = {
  id: string; supplier_id: string | null; kind: string | null; file_path: string; file_name: string; mime: string; created_at: string; confirmed_at: string | null;
};

export type PersonOption = { id: string; name: string; role: Role; payer_currency: string | null };

// Everything the money screens need. Row-level security decides what comes back for each role.
export async function loadMoney(weddingId: string) {
  const ctx = await loadWedding(weddingId);
  const { supabase, wedding } = ctx;
  const [payments, budgets, people, suppliers, checks, bookings, documents] = await Promise.all([
    supabase.from("payments").select(PAYMENT_COLUMNS).eq("wedding_id", weddingId).order("due_on", { ascending: true, nullsFirst: false }),
    supabase.from("budgets").select("category, amount_minor").eq("wedding_id", weddingId),
    supabase.from("members").select("id, display_name, role, payer_currency").eq("wedding_id", weddingId).eq("status", "active").order("created_at"),
    supabase.from("suppliers").select("id, name, legal_name, contact_name, phone, email, language").eq("wedding_id", weddingId),
    // Family get none of these back; only the couple and planner see what suppliers have in place.
    supabase.from("contract_checks").select("supplier_id, clauses, checked_at").eq("wedding_id", weddingId),
    supabase.from("booking_confirmations").select("id, supplier_id, arrive_at, confirmed_on, points, language, sent_on, reply_evidence, created_at").order("created_at").eq("wedding_id", weddingId),
    supabase.from("documents").select("id, supplier_id, kind, file_path, file_name, mime, created_at, confirmed_at").eq("wedding_id", weddingId).order("created_at", { ascending: false }),
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
    suppliers: (suppliers.data ?? []) as Supplier[],
    checks: (checks.data ?? []) as ContractCheck[],
    bookings: (bookings.data ?? []) as BookingConfirmation[],
    documents: (documents.data ?? []) as DocumentRow[],
    rates: (rates.data ?? []) as RateRow[],
  };
}
