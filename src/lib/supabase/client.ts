"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL, assertSupabaseEnv } from "@/lib/env.ts";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function supabaseBrowser() {
  assertSupabaseEnv();
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
