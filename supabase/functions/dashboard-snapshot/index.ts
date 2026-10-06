// Spec 07: GET -> DashboardSnapshot (one row per served barangay) + the open disruption. Logic in ../_shared/dashboard_snapshot.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleSnapshot } from "../_shared/dashboard_snapshot.ts";
import { fetchEvents, fetchServed, makeDisruptionStore } from "../_shared/supabase_data.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const store = makeDisruptionStore(supabase);

Deno.serve((req) => handleSnapshot(req, {
  fetchServed: () => fetchServed(supabase), findOpen: store.findOpen, fetchEvents: (id) => fetchEvents(supabase, id),
}));
