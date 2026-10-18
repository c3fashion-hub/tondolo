import { loadMoney } from "@/lib/money-data.ts";
import { formatMinor } from "@/lib/money.ts";
import { paymentsIcs } from "@/lib/calendar.ts";

// Due dates as a calendar file for Apple Calendar and Outlook: one payment (?payment=id) or every
// payment still to pay that the signed-in person can see (row-level security decides).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const only = new URL(req.url).searchParams.get("payment");
  const { payments, suppliers } = await loadMoney(id);
  const due = payments.filter((p) => !p.is_estimate && p.status === "due" && p.due_on && (!only || p.id === only));
  if (!due.length) return new Response("Nothing to add", { status: 404 });
  const ics = paymentsIcs(due.map((p) => ({
    id: p.id, title: p.title, amountText: formatMinor(p.amount_minor, p.currency), due_on: p.due_on!,
    supplier: suppliers.find((s) => s.id === p.supplier_id)?.name ?? null,
  })), id);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${only ? "payment" : "wedding-payments"}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
