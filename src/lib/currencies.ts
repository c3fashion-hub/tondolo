// Currencies at launch. `minor` is the number of decimal places (ISO 4217),
// which sets how amounts are stored in minor units.
export type Currency = { code: string; name: string; minor: 0 | 2 | 3 };

export const CURRENCIES: readonly Currency[] = [
  { code: "GBP", name: "British pound", minor: 2 },
  { code: "EUR", name: "Euro", minor: 2 },
  { code: "USD", name: "US dollar", minor: 2 },
  { code: "CAD", name: "Canadian dollar", minor: 2 },
  { code: "AUD", name: "Australian dollar", minor: 2 },
  { code: "NZD", name: "New Zealand dollar", minor: 2 },
  { code: "CHF", name: "Swiss franc", minor: 2 },
  { code: "AED", name: "UAE dirham", minor: 2 },
  { code: "MAD", name: "Moroccan dirham", minor: 2 },
  { code: "NGN", name: "Nigerian naira", minor: 2 },
  { code: "GHS", name: "Ghanaian cedi", minor: 2 },
  { code: "KES", name: "Kenyan shilling", minor: 2 },
  { code: "ZAR", name: "South African rand", minor: 2 },
  { code: "XOF", name: "West African CFA franc", minor: 0 },
  { code: "JMD", name: "Jamaican dollar", minor: 2 },
  { code: "MXN", name: "Mexican peso", minor: 2 },
  { code: "THB", name: "Thai baht", minor: 2 },
  { code: "IDR", name: "Indonesian rupiah", minor: 2 },
  { code: "TRY", name: "Turkish lira", minor: 2 },
  { code: "INR", name: "Indian rupee", minor: 2 },
  { code: "HKD", name: "Hong Kong dollar", minor: 2 },
  { code: "JPY", name: "Japanese yen", minor: 0 },
  { code: "CNY", name: "Chinese yuan", minor: 2 },
  { code: "SGD", name: "Singapore dollar", minor: 2 },
  { code: "SEK", name: "Swedish krona", minor: 2 },
  { code: "NOK", name: "Norwegian krone", minor: 2 },
  { code: "DKK", name: "Danish krone", minor: 2 },
  { code: "PLN", name: "Polish zloty", minor: 2 },
  { code: "CZK", name: "Czech koruna", minor: 2 },
  { code: "HUF", name: "Hungarian forint", minor: 2 },
  { code: "TND", name: "Tunisian dinar", minor: 3 },
  { code: "EGP", name: "Egyptian pound", minor: 2 },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currency(code: string): Currency | undefined {
  return BY_CODE.get(code);
}
