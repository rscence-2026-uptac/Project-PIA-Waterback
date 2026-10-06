// Disruption lifecycle: POST {as_of?} runs the predictor and opens/updates the disruption; POST {action:"confirm", disruption_id} confirms it.
// Logic in ../_shared/disruption_monitor.ts. Writes with the service role (RLS has no write policies).
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleMonitor } from "../_shared/disruption_monitor.ts";
import { makeDisruptionStore, makeFetchData } from "../_shared/supabase_data.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve((req) => handleMonitor(req, { fetchData: makeFetchData(supabase), store: makeDisruptionStore(supabase) }));
