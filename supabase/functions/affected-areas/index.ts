// Spec 03: GET ?as_of=ISO[&disruption_id=uuid][&min_signal=0-4] -> AffectedArea[] for all 57 barangays. Logic in ../_shared/affected.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleAffectedAreas } from "../_shared/affected.ts";
import { fetchBarangays, makeDisruptionStore, makeFetchData } from "../_shared/supabase_data.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const store = makeDisruptionStore(supabase);

Deno.serve((req) => handleAffectedAreas(req, {
  fetchData: makeFetchData(supabase), fetchBarangays: () => fetchBarangays(supabase),
  findOpen: store.findOpen, getById: store.getById,
}));
