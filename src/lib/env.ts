export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function assertSupabaseEnv(): void {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase settings are missing. See .env.example.");
}
