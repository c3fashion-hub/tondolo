import { divRound } from "./money.ts";

// The Protection Kit's tax rates by country and item ("VAT and local taxes: the hidden 10 to 23%").
// Only mainland Portugal and Spain are known; everywhere else the app says "tax not shown" and asks
// the couple to check with the supplier. Rates are basis points. Never a flat 20%.
type Item = "services" | "food" | "drinks" | "flowers" | "hotel" | "guestTransport";
type Country = "PT" | "ES";

const RATES: Record<Country, Partial<Record<Item, number>>> = {
  PT: { services: 2300, food: 1300, drinks: 2300, hotel: 600 },
  ES: { services: 2100, food: 1000, drinks: 1000, flowers: 1000, hotel: 1000, guestTransport: 1000 },
};

const ITEM_OF: Record<string, Item> = {
  "Venue hire": "services",
  "Venue extras: permits, generator, security, cleaning, toilets": "services",
  "Wedding planner / coordinator": "services",
  "Officiant / celebrant": "services",
  "Photography": "services",
  "Videography": "services",
  "Music, DJ and sound": "services",
  "Hair and make-up": "services",
  "Furniture and rentals": "services",
  "Stationery and signage": "services",
  "Catering": "food",
  "Bar and drinks": "drinks",
  "Florals and décor": "flowers",
  "Supplier accommodation": "hotel",
  "Guest transport and transfers": "guestTransport",
};

// Islands have their own rates (Madeira, the Azores) or a different tax (the Canaries), so they're unknown.
export function taxCountry(destination: string | null): Country | null {
  const d = (destination ?? "").toLowerCase();
  if (/madeira|azores|açores|canar|tenerife|lanzarote|fuerteventura|la palma/.test(d)) return null;
  if (/portugal/.test(d)) return "PT";
  if (/spain|españa|espana/.test(d)) return "ES";
  return null;
}

// The rate to use for a quote without tax: the couple's own if they entered one, else the Kit's.
export function likelyTaxRate(category: string | null, destination: string | null, entered: number | null): number | null {
  if (entered !== null) return entered;
  const country = taxCountry(destination);
  const item = category ? ITEM_OF[category] : undefined;
  return country && item ? RATES[country][item] ?? null : null;
}

export const taxOn = (amountMinor: number, rateBp: number) => divRound(amountMinor * rateBp, 10_000);
