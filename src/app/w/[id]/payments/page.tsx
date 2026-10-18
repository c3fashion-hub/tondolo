import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return <ComingSoon title="Payments" what="Soon you'll add each deposit and balance here, in the currency the supplier charges, or scan the quote and check what we found." />;
}
