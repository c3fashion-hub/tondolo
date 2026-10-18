"use client";

import { ScanSheet } from "@/components/scan/ScanSheet";
import { QUINTA_CONTRACT, QUINTA_INVOICE } from "@/lib/example/scans.ts";
import { DESTINATION, SUPPLIERS, TODAY } from "@/lib/example/wedding.ts";

// The scan review with the example wedding's documents, already read. Saving does nothing here.
export function ScanPreview({ mode }: { mode: "scan" | "contract" }) {
  const initial = [{
    ok: true as const, documentId: "00000000-0000-4000-8000-000000000001", mode,
    fileName: mode === "scan" ? "fatura-quinta-do-rio.pdf" : "contrato-quinta-do-rio.pdf",
    result: mode === "scan" ? QUINTA_INVOICE : QUINTA_CONTRACT, readsLeft: 99,
  }];
  return <ScanSheet open mode={mode} weddingId="example" destination={DESTINATION} today={TODAY} suppliers={SUPPLIERS}
    supplierName={mode === "contract" ? "Quinta do Rio" : null} initial={initial} onClose={() => {}} onDone={() => {}} />;
}
