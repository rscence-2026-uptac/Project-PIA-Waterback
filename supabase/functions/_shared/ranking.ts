// Spec 04: continuity ranking. Pure logic (rankSources) + request handler with injected data access.
import { WSP_CONSTANTS } from "./constants.generated.ts";
import { buildAffectedAreas } from "./affected.ts";
import type { BarangayRow } from "./affected.ts";
import type { DisruptionRow } from "./disruption_monitor.ts";
import { json, preflight, UUID_RE } from "./http.ts";

export type SourceType = "piped" | "refill_station" | "trucking" | "communal_tap" | "neighboring_barangay";
export type Provenance = "wsp" | "osm" | "web" | "placeholder";
export interface SourceRow {
  id: string;
  barangay_id: string;
  name: string;
  type: SourceType;
  safety_score: number;
  travel_minutes: number;
  cost_php_per_unit: number;
  active: boolean;
  provenance: Provenance;
  source_ref: string | null;
  is_simulated: boolean;
}
export interface RankedSourceOut {
  source_id: string;
  name: string;
  type: SourceType;
  safety_score: number;
  travel_minutes: number;
  exceeds_jmp_benchmark: boolean;
  cost_php_per_unit: number;
  rank: number;
  /** Extras (spec 04): lets the UI label simulated vs verified rows. */
  provenance: Provenance;
  is_simulated: boolean;
  source_ref: string | null;
}
export type ExclusionReason = "inactive" | "system_wide_cause_neighbor_blended_network";
export interface ExcludedSource { source_id: string; name: string; type: SourceType; reason: ExclusionReason }
export interface RankedChainOut {
  barangay_id: string;
  disruption_id: string;
  ranked_sources: RankedSourceOut[];
  /** Candidates removed before ranking (spec 04 AC4: inactive; Dev A rule: neighbors on a system-wide cause). */
  excluded: ExcludedSource[];
  warning?: "no_eligible_sources";
  computed_at: string;
}

/** Causes where the whole blended CWD network is down: a "neighboring barangay" is dry too (WSP pp.12, 15). */
export const SYSTEM_WIDE_CAUSES = ["turbidity", "drought"] as const;
export const isSystemWide = (cause: string | null | undefined): boolean => (SYSTEM_WIDE_CAUSES as readonly string[]).includes(cause ?? "");

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Filters then orders one barangay's candidates: safety desc, travel asc, cost asc, source id asc (deterministic).
 * `exceeds_jmp_benchmark` flags (never excludes) travel_minutes > JMP_ROUNDTRIP_MIN.
 */
export function rankSources(sources: SourceRow[], cause: string | null): { ranked: RankedSourceOut[]; excluded: ExcludedSource[] } {
  const excluded: ExcludedSource[] = [];
  const eligible: SourceRow[] = [];
  for (const s of sources) {
    const ex = (reason: ExclusionReason) => excluded.push({ source_id: s.id, name: s.name, type: s.type, reason });
    if (!s.active) ex("inactive");
    else if (s.type === "neighboring_barangay" && isSystemWide(cause)) ex("system_wide_cause_neighbor_blended_network");
    else eligible.push(s);
  }
  eligible.sort((a, b) =>
    (b.safety_score - a.safety_score) || (a.travel_minutes - b.travel_minutes) || (a.cost_php_per_unit - b.cost_php_per_unit) || cmpStr(a.id, b.id));
  excluded.sort((a, b) => cmpStr(a.source_id, b.source_id));
  const ranked = eligible.map((s, i): RankedSourceOut => ({
    source_id: s.id, name: s.name, type: s.type, safety_score: s.safety_score, travel_minutes: s.travel_minutes,
    exceeds_jmp_benchmark: s.travel_minutes > WSP_CONSTANTS.JMP_ROUNDTRIP_MIN, cost_php_per_unit: s.cost_php_per_unit, rank: i + 1,
    provenance: s.provenance, is_simulated: s.is_simulated, source_ref: s.source_ref,
  }));
  return { ranked, excluded };
}

export function buildChain(barangayId: string, disruptionId: string, cause: string | null, sources: SourceRow[], computedAt: string): RankedChainOut {
  const { ranked, excluded } = rankSources(sources, cause);
  const chain: RankedChainOut = { barangay_id: barangayId, disruption_id: disruptionId, ranked_sources: ranked, excluded, computed_at: computedAt };
  if (ranked.length === 0) chain.warning = "no_eligible_sources";
  return chain;
}

export interface ChainRow { barangay_id: string; disruption_id: string; ranked_source_ids: string[]; computed_at: string }
export interface RankDeps {
  getDisruption: (id: string) => Promise<DisruptionRow | null>;
  fetchBarangays: () => Promise<BarangayRow[]>;
  /** All sources (active or not) of the given barangays. */
  fetchSources: (barangayIds: string[]) => Promise<SourceRow[]>;
  /** Upsert on (disruption_id, barangay_id): re-running replaces ranked_source_ids + computed_at. Service role. */
  upsertChains: (rows: ChainRow[]) => Promise<void>;
  now?: () => Date;
  log?: (msg: string, data?: unknown) => void;
}

/** Ranks and persists chains for the given barangays. Never throws for an empty chain. */
export async function rankAndPersist(deps: RankDeps, disruption: DisruptionRow, barangayIds: string[]): Promise<RankedChainOut[]> {
  const computedAt = (deps.now ?? (() => new Date()))().toISOString();
  const all = await deps.fetchSources(barangayIds);
  const by = new Map<string, SourceRow[]>();
  for (const s of all) (by.get(s.barangay_id) ?? by.set(s.barangay_id, []).get(s.barangay_id)!).push(s);
  const chains = barangayIds.map((b) => buildChain(b, disruption.id, disruption.cause, by.get(b) ?? [], computedAt));
  for (const c of chains) {
    if (c.excluded.length) (deps.log ?? console.log)("rank-chain excluded", { barangay_id: c.barangay_id, disruption_id: c.disruption_id, excluded: c.excluded });
    if (c.warning) (deps.log ?? console.warn)("rank-chain warning", { barangay_id: c.barangay_id, warning: c.warning });
  }
  await deps.upsertChains(chains.map((c) => ({
    barangay_id: c.barangay_id, disruption_id: c.disruption_id, ranked_source_ids: c.ranked_sources.map((s) => s.source_id), computed_at: c.computed_at,
  })));
  return chains;
}

/**
 * POST { barangay_id, disruption_id }                      -> RankedChain
 * POST { disruption_id, barangay_ids?: string[] }          -> { disruption_id, cause, chains: RankedChain[] }
 * Batch default (no barangay_ids): every barangay affected per spec 03 at the disruption's signal (signal >= 2 -> all 57; below -> none).
 */
export async function handleRankChain(req: Request, deps: RankDeps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  let body: Record<string, unknown>;
  try { body = ((await req.json()) ?? {}) as Record<string, unknown>; }
  catch { return json(400, { error: "invalid JSON body" }); }
  if (typeof body !== "object" || Array.isArray(body)) return json(400, { error: "body must be a JSON object" });
  if (typeof body.disruption_id !== "string" || !UUID_RE.test(body.disruption_id)) return json(400, { error: "disruption_id (uuid) is required" });
  const single = body.barangay_id !== undefined;
  if (single && (typeof body.barangay_id !== "string" || !body.barangay_id)) return json(400, { error: "barangay_id must be a non-empty string" });
  if (single && body.barangay_ids !== undefined) return json(400, { error: "pass barangay_id or barangay_ids, not both" });
  if (!single && body.barangay_ids !== undefined && (!Array.isArray(body.barangay_ids) || body.barangay_ids.some((x) => typeof x !== "string" || !x)))
    return json(400, { error: "barangay_ids must be an array of strings" });

  try {
    const disruption = await deps.getDisruption(body.disruption_id);
    if (!disruption) return json(404, { error: "disruption not found" });
    const barangays = await deps.fetchBarangays();
    const known = new Set(barangays.map((b) => b.barangay_id));
    if (single) {
      if (!known.has(body.barangay_id as string)) return json(404, { error: "barangay not found" });
      const [chain] = await rankAndPersist(deps, disruption, [body.barangay_id as string]);
      return json(200, chain);
    }
    let ids: string[];
    if (body.barangay_ids !== undefined) {
      ids = [...new Set(body.barangay_ids as string[])];
      const unknown = ids.filter((b) => !known.has(b));
      if (unknown.length) return json(400, { error: `unknown barangay_ids: ${unknown.join(", ")}` });
    } else {
      ids = buildAffectedAreas(barangays, { signal_level: disruption.signal_level, cause: disruption.cause, disruption_id: disruption.id, min_signal: 2 })
        .map((a) => a.barangay_id);
    }
    ids.sort(cmpStr);
    const chains = ids.length ? await rankAndPersist(deps, disruption, ids) : [];
    return json(200, { disruption_id: disruption.id, cause: disruption.cause, chains });
  } catch (e) {
    console.error("rank-chain failed", e);
    return json(500, { error: "failed to rank sources" });
  }
}
