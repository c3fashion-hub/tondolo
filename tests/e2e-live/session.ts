import type { BrowserContext } from "@playwright/test";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const CHUNK = 3180;

// Signs a test person in by setting the same cookie the app's Supabase client would set.
export async function signIn(context: BrowserContext, email: string, baseURL: string) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: process.env.E2E_PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status} ${await res.text()}`);
  const session = await res.json();
  session.expires_at ??= Math.floor(Date.now() / 1000) + session.expires_in;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${REF}-auth-token`;
  const parts = value.length <= CHUNK ? [[name, value]] : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => [`${name}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK)]);
  await context.addCookies(parts.map(([n, v]) => ({ name: n, value: v, url: baseURL, sameSite: "Lax" as const })));
}
