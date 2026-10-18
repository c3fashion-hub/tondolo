import type { Metadata } from "next";
import { FinishSetup } from "./FinishSetup";

export const metadata: Metadata = { title: "Saving your wedding" };

export default function FinishPage() {
  return (
    <main className="tn-page">
      <FinishSetup />
    </main>
  );
}
