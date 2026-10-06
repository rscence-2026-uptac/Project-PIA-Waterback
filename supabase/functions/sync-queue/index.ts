// sync-queue (spec 05): POST OfflineQueueItem[] -> per-item status (synced | already_synced | rejected | failed).
// Logic is in ../_shared (pure TS, vitest-tested); this file is only the Deno + Supabase wrapper.
import { createClient } from "npm:@supabase/supabase-js@2";
import { syncQueue } from "../_shared/sync.ts";
import { serve } from "../_shared/spec06_http.ts";
import { supabaseStore } from "../_shared/spec06_supabase.ts";

const store = supabaseStore(createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
}));
Deno.serve((req) => serve(req, "sync-queue", (body) => syncQueue(store, body, new Date())));
