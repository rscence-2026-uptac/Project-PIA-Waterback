// deploy-response (spec 06): POST DeployResponse -> `deployed` event (step: source) naming the source sent.
// Logic is in ../_shared (pure TS, vitest-tested); this file is only the Deno + Supabase wrapper.
import { createClient } from "npm:@supabase/supabase-js@2";
import { deployResponse } from "../_shared/allocation.ts";
import { serve } from "../_shared/spec06_http.ts";
import { supabaseStore } from "../_shared/spec06_supabase.ts";

const store = supabaseStore(createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
}));
Deno.serve((req) => serve(req, "deploy-response", (body) => deployResponse(store, body, new Date())));
