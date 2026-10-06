// Spec 04: POST {barangay_id, disruption_id} -> RankedChain; POST {disruption_id, barangay_ids?} -> {chains}. Logic in ../_shared/ranking.ts.
// Writes continuity_chains with the service role (RLS has no write policies).
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleRankChain } from "../_shared/ranking.ts";
import { fetchBarangays, makeDisruptionStore } from "../_shared/supabase_data.ts";
import { makeRankStore } from "../_shared/ranking_data.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const store = makeDisruptionStore(supabase);
const rank = makeRankStore(supabase);

Deno.serve((req) => handleRankChain(req, { getDisruption: store.getById, fetchBarangays: () => fetchBarangays(supabase), ...rank }));
