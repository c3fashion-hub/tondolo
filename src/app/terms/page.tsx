import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS } from "@/lib/legal.ts";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return <LegalPage title="Terms" sections={TERMS} />;
}
