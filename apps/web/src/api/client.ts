// Supabase wiring. Live mode needs BOTH env vars (apps/web/.env.local, gitignored); without them
// every screen keeps running on the sample data in src/data (graceful fallback, never a crash).
// Only the anon key belongs here. The service-role key must never reach the browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const SUPABASE_URL = clean(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, "");
export const SUPABASE_ANON_KEY = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** True when the project URL and anon key are both configured. */
export function isLive(): boolean {
  return SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";
}

let client: SupabaseClient | null = null;

/** The shared Supabase client (REST + Realtime), or null when not live. */
export function getClient(): SupabaseClient | null {
  if (!isLive()) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Same as getClient() for code that only runs after an isLive() check. */
export function requireClient(): SupabaseClient {
  const c = getClient();
  if (!c) throw new Error("Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
  return c;
}
