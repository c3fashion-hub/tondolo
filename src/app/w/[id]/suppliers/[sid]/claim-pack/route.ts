import { loadMoney } from "@/lib/money-data.ts";
import { can } from "@/lib/roles.ts";
import { todayIn } from "@/lib/dates.ts";
import { RateBook } from "@/lib/rates.ts";
import { protectionFor } from "@/lib/protection.ts";
import { claimPackPdf } from "@/lib/claim-pack.ts";

// The claim pack PDF for one supplier, built on the server from what row-level security returns
// for the signed-in person. The couple and planner only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const data = await loadMoney(id);
  if (!can(data.me.role).seeAllPayments) return new Response("Not found", { status: 404 });
  const supplier = data.suppliers.find((s) => s.id === sid);
  if (!supplier) return new Response("Not found", { status: 404 });
  const today = todayIn();
  const home = data.wedding.home_currency;
  const payments = data.payments.filter((p) => p.supplier_id === sid);
  const pdf = await claimPackPdf({
    names: data.wedding.names, destination: data.wedding.destination, weddingDate: data.wedding.wedding_date, home, today, supplier,
    protection: protectionFor(supplier, data.payments, data.checks, data.bookings, data.wedding.wedding_date, home, new RateBook(data.rates), today),
    payments, checks: data.checks.filter((c) => c.supplier_id === sid), bookings: data.bookings.filter((b) => b.supplier_id === sid),
  });
  const file = `claim-pack-${supplier.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "supplier"}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "private, no-store" },
  });
}
