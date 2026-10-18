import type { ContractResult, ScanResult } from "../reading.ts";

// What reading the example wedding's documents returns (spec: "Scan review"), for the local
// preview and tests. The real answers come from the read-document function.
export const QUINTA_INVOICE: ScanResult = {
  readable: true, problem: null, document_kind: "invoice", language: "Portuguese",
  supplier: { name: "Quinta do Rio", legal_name: "Quinta do Rio, Lda.", tax_number: null, email: null, phone: null, country: "Portugal" },
  currency: "EUR", total: "26000.00",
  tax: { status: "not_included", rate_percent: "23", wording: "IVA não incluído" },
  category: "Venue hire",
  payments: [
    { label: "deposit 30%", amount: "7800.00", due_date: null, status: "paid", paid_date: "2026-06-15" },
    { label: "balance 70%", amount: "18200.00", due_date: "2027-05-26", status: "due", paid_date: null },
  ],
};

const c = (state: "present" | "incomplete" | "missing", evidence: string | null = null) => ({ state, evidence });
export const QUINTA_CONTRACT: ContractResult = {
  readable: true, problem: null, language: "Portuguese", supplier_name: "Quinta do Rio",
  must_haves: {
    payment_schedule: c("present", "30% na reserva, 70% até 30 dias antes do evento. Será emitida fatura-recibo de cada pagamento."),
    named_people: c("incomplete", "A coordenação do evento será assegurada pela nossa coordenadora, Ana Silva."),
    supplier_cancels: c("missing"),
  },
  recommended: {
    who: c("present", "Quinta do Rio, Lda., NIPC 500000000"), what: c("present", "Aluguer do espaço das 12h00 às 02h00"),
    price_currency: c("incomplete", "Valores em euros, acrescidos de IVA à taxa legal."), you_cancel: c("present", "Em caso de cancelamento pelo cliente, o sinal não é reembolsável."),
    force_majeure: c("missing"), third_parties: c("missing"), changes_language: c("missing"),
  },
  red_flags: ["The contract doesn't say you get your money back if the venue cancels."],
  tax: { status: "not_included", rate_percent: "23", wording: "acrescidos de IVA" },
};
