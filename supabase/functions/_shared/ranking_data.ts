// Supabase-backed data access for spec 04 (ranking) and the affected-areas top_source lookup.
// deno-lint-ignore-file no-explicit-any
import type { SourceRow } from "./ranking.ts";
import type { ChainRow } from "./ranking.ts";
import type { SupabaseLike } from "./supabase_data.ts";
import { fetchAll } from "./supabase_data.ts";

const SOURCE_COLS = "id,barangay_id,name,type,safety_score,travel_minutes,cost_php_per_unit,active,provenance,source_ref,is_simulated,network_dependent";
const toSource = (r: any): SourceRow => ({
  ...r, safety_score: Number(r.safety_score), travel_minutes: Number(r.travel_minutes), cost_php_per_unit: Number(r.cost_php_per_unit),
  source_ref: r.source_ref ?? null, is_simulated: !!r.is_simulated, network_dependent: !!r.network_dependent,
});

export function makeRankStore(supabase: SupabaseLike) {
  return {
    fetchSources: async (barangayIds: string[]): Promise<SourceRow[]> => {
      const out: SourceRow[] = [];
      for (let i = 0; i < barangayIds.length; i += 100) { // chunk the IN list
        const ids = barangayIds.slice(i, i + 100);
        out.push(...(await fetchAll<any>((a, b) => supabase.from("sources").select(SOURCE_COLS).in("barangay_id", ids).order("id").range(a, b))).map(toSource));
      }
      return out;
    },
    upsertChains: async (rows: ChainRow[]): Promise<void> => {
      if (!rows.length) return;
      const { error } = await supabase.from("continuity_chains").upsert(rows, { onConflict: "disruption_id,barangay_id" });
      if (error) throw new Error(error.message);
    },
  };
}

/** barangay_id -> first still-active source of its persisted chain (null entries omitted). */
export async function fetchTopSources(supabase: SupabaseLike, disruptionId: string): Promise<Map<string, SourceRow>> {
  const chains = await fetchAll<any>((a, b) => supabase.from("continuity_chains").select("barangay_id,ranked_source_ids")
    .eq("disruption_id", disruptionId).order("barangay_id").range(a, b));
  const ids = [...new Set(chains.flatMap((c) => (c.ranked_source_ids ?? []) as string[]))];
  const byId = new Map<string, SourceRow>();
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    for (const r of await fetchAll<any>((a, b) => supabase.from("sources").select(SOURCE_COLS).in("id", part).order("id").range(a, b))) byId.set(r.id, toSource(r));
  }
  const out = new Map<string, SourceRow>();
  for (const c of chains) {
    const top = ((c.ranked_source_ids ?? []) as string[]).map((id) => byId.get(id)).find((s) => s && s.active);
    if (top) out.set(c.barangay_id, top);
  }
  return out;
}
