// resident-confirmation (spec 06 AC3-4): POST ResidentConfirmation (+ client_local_id) -> `resident_confirmed`, maybe `resolved`.
// Logic is in ../_shared (pure TS, vitest-tested); this file is only the Deno + Supabase wrapper.
import { createClient } from "npm:@supabase/supabase-js@2";
import { recordConfirmation } from "../_shared/confirmation.ts";
import { serve } from "../_shared/spec06_http.ts";
import { supabaseStore } from "../_shared/spec06_supabase.ts";

const store = supabaseStore(createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
}));
Deno.serve((req) => serve(req, "resident-confirmation", (body) => recordConfirmation(store, body, new Date())));
