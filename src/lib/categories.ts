// The standard destination wedding budget (spec: "Standard starter budget"). Shares are a
// percentage of the rough total; `plan` says how its payments are spread. Mags will tune these.
export type Plan = "split3" | "cater" | "sup" | "day" | "onday" | "now" | "d90" | "d60" | "d30" | "d14" | "d7" | "dress";
export type Line = { name: string; share: number; plan: Plan | null };
export type Group = { name: string; lines: Line[] };

export const GROUPS: Group[] = [
  { name: "Planning, admin and money", lines: [
    { name: "Wedding planner / coordinator", share: 7, plan: "split3" },
    { name: "Site visit and tasting trips", share: 1.5, plan: "now" },
    { name: "Wedding insurance", share: 0.5, plan: "now" },
    { name: "Currency, card and bank fees", share: 1, plan: null },
    { name: "Local taxes and tourist tax", share: 0, plan: null },
    { name: "Contingency", share: 9, plan: null },
  ] },
  { name: "Legal and paperwork", lines: [
    { name: "Legal paperwork, apostilles and translations", share: 0.5, plan: "d90" },
    { name: "Officiant / celebrant", share: 0.5, plan: "d30" },
  ] },
  { name: "Venue", lines: [
    { name: "Venue hire", share: 18, plan: "split3" },
    { name: "Venue extras: permits, generator, security, cleaning, toilets", share: 4, plan: "d30" },
  ] },
  { name: "Food and drink", lines: [
    { name: "Catering", share: 15, plan: "cater" },
    { name: "Bar and drinks", share: 4, plan: "cater" },
    { name: "Cake and desserts", share: 1, plan: "d30" },
  ] },
  { name: "Suppliers on the day", lines: [
    { name: "Photography", share: 4, plan: "sup" },
    { name: "Videography", share: 3, plan: "sup" },
    { name: "Music, DJ and sound", share: 4, plan: "sup" },
    { name: "Hair and make-up", share: 2, plan: "day" },
    { name: "Florals and décor", share: 5, plan: "sup" },
    { name: "Furniture and rentals", share: 0, plan: null },
    { name: "Stationery and signage", share: 0, plan: null },
  ] },
  { name: "Supplier travel and hospitality", lines: [
    { name: "Supplier flights", share: 2, plan: "d60" },
    { name: "Supplier transfers: home to airport and back, both ends", share: 0.3, plan: "d7" },
    { name: "Supplier transfers: airport to accommodation and back", share: 0.3, plan: "d7" },
    { name: "Supplier transfers: accommodation to venue, each working day", share: 0.4, plan: "d7" },
    { name: "Supplier accommodation", share: 1.5, plan: "d60" },
    { name: "Supplier food allowance", share: 0.5, plan: "onday" },
  ] },
  { name: "Guests and events", lines: [
    { name: "Welcome party", share: 4, plan: "cater" },
    { name: "Farewell brunch", share: 2, plan: "cater" },
    { name: "Guest transport and transfers", share: 2, plan: "d14" },
    { name: "Welcome bags and favours", share: 1, plan: "d30" },
    { name: "Childcare", share: 0, plan: null },
  ] },
  { name: "Attire", lines: [
    { name: "Wedding dress and alterations", share: 3.5, plan: "dress" },
    { name: "Suit and alterations", share: 1.5, plan: "dress" },
    { name: "Shoes, accessories and cultural outfits", share: 1, plan: "d30" },
  ] },
  { name: "Your own travel", lines: [
    { name: "Your flights and transfers", share: 0, plan: null },
    { name: "Your accommodation", share: 0, plan: null },
    { name: "Excess baggage and shipping", share: 0, plan: null },
  ] },
  { name: "After the wedding", lines: [
    { name: "Final invoices, overtime and tips", share: 0, plan: null },
    { name: "Dress cleaning and shipping home", share: 0, plan: null },
  ] },
];

export const CATEGORIES: string[] = GROUPS.flatMap((g) => g.lines.map((l) => l.name));
const GROUP_OF = new Map(GROUPS.flatMap((g) => g.lines.map((l) => [l.name, g.name] as const)));
export const groupOf = (category: string | null): string => (category && GROUP_OF.get(category)) || "Other";

// Each part of a plan: its share of the line, when it's due ("book" = two weeks after setup,
// otherwise days before the wedding), and its label.
export const PLANS: Record<Plan, { share: number; when: "book" | number; label: string }[]> = {
  split3: [{ share: 30, when: "book", label: "deposit" }, { share: 40, when: 180, label: "second payment" }, { share: 30, when: 30, label: "final balance" }],
  cater: [{ share: 30, when: "book", label: "deposit" }, { share: 70, when: 14, label: "balance after final numbers" }],
  sup: [{ share: 30, when: "book", label: "deposit" }, { share: 70, when: 30, label: "balance" }],
  day: [{ share: 30, when: "book", label: "deposit" }, { share: 70, when: 0, label: "balance on the day" }],
  onday: [{ share: 100, when: 0, label: "on the day" }],
  now: [{ share: 100, when: "book", label: "" }],
  d90: [{ share: 100, when: 90, label: "" }],
  d60: [{ share: 100, when: 60, label: "" }],
  d30: [{ share: 100, when: 30, label: "" }],
  d14: [{ share: 100, when: 14, label: "" }],
  d7: [{ share: 100, when: 7, label: "" }],
  dress: [{ share: 50, when: "book", label: "deposit" }, { share: 50, when: 60, label: "balance" }],
};

// Costs couples most often forget, for the money health check. The three supplier transfer lines count as one.
export const COMMONLY_FORGOTTEN: { label: string; categories: string[] }[] = [
  { label: "supplier transfers", categories: ["Supplier transfers: home to airport and back, both ends", "Supplier transfers: airport to accommodation and back", "Supplier transfers: accommodation to venue, each working day"] },
  { label: "supplier flights", categories: ["Supplier flights"] },
  { label: "supplier accommodation", categories: ["Supplier accommodation"] },
  { label: "supplier food allowance", categories: ["Supplier food allowance"] },
  { label: "local and tourist tax", categories: ["Local taxes and tourist tax"] },
  { label: "currency, card and bank fees", categories: ["Currency, card and bank fees"] },
  { label: "guest transport", categories: ["Guest transport and transfers"] },
  { label: "contingency", categories: ["Contingency"] },
  { label: "final invoices, overtime and tips", categories: ["Final invoices, overtime and tips"] },
];
