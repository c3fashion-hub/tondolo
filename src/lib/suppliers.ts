// "Quinta do Rio – deposit 30%" -> "Quinta do Rio". The part before a dash names the supplier.
export function supplierNameFrom(title: string): string {
  return title.split(/\s+[–—-]\s+/)[0].trim().slice(0, 120);
}
