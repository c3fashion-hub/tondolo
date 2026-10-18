// Shown wherever converted amounts appear (spec: check-your-information notice for exchange rates).
export function RatesNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p className={compact ? "tn-small tn-muted" : "tn-note"} style={compact ? { margin: 0 } : undefined}>
      Rates are a guide and can differ from what your bank or card charges.{" "}
      <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates by Exchange Rate API</a>
    </p>
  );
}
