import { PRICES, PRICE_CURRENCIES, currencyFor, type PriceCurrency } from "../../supabase/functions/_shared/billing.ts";
import { formatMinor } from "./money.ts";

// Buying Tondolo in the app. The prices live with the server's checkout so both always agree.
export { PRICES, PRICE_CURRENCIES, currencyFor, type PriceCurrency };

// Stripe stays in test mode until Mags says go live (the server also refuses a live key).
export const TEST_MODE = true;

export const priceText = (c: PriceCurrency) => formatMinor(PRICES[c], c);

export const CHECKOUT_ERRORS: Record<string, string> = {
  not_owner: "Only the person who set up this wedding can pay for it.",
  already_unlocked: "This wedding is already unlocked.",
  not_configured: "Payments aren't switched on yet. Try again later.",
  live_key_refused: "Payments aren't switched on yet. Try again later.",
  signed_out: "Sign in again, then try once more.",
  network: "We couldn't reach Tondolo. Check your connection and try again.",
  busy: "We couldn't open the payment page just now. Try again in a minute.",
};
export const checkoutError = (code: string | undefined) => CHECKOUT_ERRORS[code ?? ""] ?? CHECKOUT_ERRORS.busy;
