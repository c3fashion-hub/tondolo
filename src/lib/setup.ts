import { currency } from "./currencies.ts";
import { parseAmountToMinor } from "./money.ts";

export type SetupInput = {
  weddingDate: string;
  destination: string;
  homeCurrency: string;
  names: string;
  roughBudget: string;
  useStarterBudget: boolean;
};

export type SetupDraft = {
  weddingDate: string;
  destination: string;
  homeCurrency: string;
  names: string | null;
  roughBudgetMinor: number | null;
  useStarterBudget: boolean;
};

export type SetupErrors = Partial<Record<keyof SetupInput, string>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// `today` is the person's local date as YYYY-MM-DD, passed in so tests can fix it.
export function validateSetup(input: SetupInput, today: string): { ok: true; draft: SetupDraft } | { ok: false; errors: SetupErrors } {
  const errors: SetupErrors = {};
  const destination = input.destination.trim();
  const names = input.names.trim();

  if (!input.weddingDate) errors.weddingDate = "Add your wedding date.";
  else if (!isRealDate(input.weddingDate)) errors.weddingDate = "Enter a real date.";
  else if (input.weddingDate < today) errors.weddingDate = "Choose a date from today onwards.";

  if (!destination) errors.destination = "Add where you're getting married.";
  else if (destination.length > 120) errors.destination = "Keep this under 120 characters.";

  if (!currency(input.homeCurrency)) errors.homeCurrency = "Choose the currency you pay from.";

  if (names.length > 80) errors.names = "Keep this under 80 characters.";

  let roughBudgetMinor: number | null = null;
  if (input.roughBudget.trim() && !errors.homeCurrency) {
    roughBudgetMinor = parseAmountToMinor(input.roughBudget, input.homeCurrency);
    if (roughBudgetMinor === null || roughBudgetMinor <= 0) errors.roughBudget = "Enter an amount, like 40,000, or leave it blank.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    draft: {
      weddingDate: input.weddingDate,
      destination,
      homeCurrency: input.homeCurrency,
      names: names || null,
      roughBudgetMinor,
      useStarterBudget: input.useStarterBudget,
    },
  };
}
