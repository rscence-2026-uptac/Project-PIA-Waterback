// Spec 04 (continuity ranking) + spec 03 suggested_rank/top_source. Data access via FakeSupabase.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RankedChain as RankedChainSchema } from "../../../packages/shared-types/src/index.ts";
import { buildAffectedAreas, handleAffectedAreas, suggestRanks } from "../../functions/_shared/affected.ts";
import type { BarangayRow } from "../../functions/_shared/affected.ts";
import { buildChain, handleRankChain, rankSources } from "../../functions/_shared/ranking.ts";
import type { SourceRow } from "../../functions/_shared/ranking.ts";
import { fetchTopSources, makeRankStore } from "../../functions/_shared/ranking_data.ts";
import { fetchBarangays, makeDisruptionStore } from "../../functions/_shared/supabase_data.ts";
import { FakeSupabase } from "./fakeSupabase.ts";
import { forecastSeries, kuladorSeries, rainSeries } from "./helpers.ts";

const BARANGAYS: BarangayRow[] = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/barangays_pia_dev.json"), "utf8"));
const D = "3f1c2a40-9b7e-4c1a-8d2e-5a6b7c8d9e01";
const NOW = new Date("2026-07-10T04:00:00Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const src = (n: number, o: Partial<SourceRow> = {}): SourceRow => ({
  id: id(n), barangay_id: "poblacion-05", name: `s${n}`, type: "refill_station", safety_score: 0.9, travel_minutes: 10, cost_php_per_unit: 0,
  active: true, provenance: "osm", source_ref: "ref", is_simulated: false, ...o,
});
const disruption = (cause = "turbidity", signal_level = 3) => ({
  id: D, started_at: "2026-07-10T00:00:00Z", resolved_at: null, cause, p_turbidity: 0.8, p_drought: 0, signal_level, status: "confirmed",
  window_start: null, window_end: null, likely_at: null, next_update_at: null, heads_up_from: null,
});

describe("rankSources (spec 04)", () => {
  it("AC1: >= 3 sources ordered safety desc, time asc, cost asc", () => {
    const { ranked } = rankSources([
      src(1, { safety_score: 0.7, travel_minutes: 5 }),
      src(2, { safety_score: 0.9, travel_minutes: 20, cost_php_per_unit: 25 }),
      src(3, { safety_score: 0.9, travel_minutes: 10, cost_php_per_unit: 25 }),
      src(4, { safety_score: 0.9, travel_minutes: 10, cost_php_per_unit: 5 }),
    ], "repair");
    expect(ranked.map((r) => r.source_id)).toEqual([id(4), id(3), id(2), id(1)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
  it("AC2: identical keys tie-break by source_id asc, input order irrelevant", () => {
    const rows = [src(9), src(3), src(7), src(1)];
    const a = rankSources(rows, "drought").ranked.map((r) => r.source_id);
    const b = rankSources([...rows].reverse(), "drought").ranked.map((r) => r.source_id);
    expect(a).toEqual([id(1), id(3), id(7), id(9)]);
    expect(b).toEqual(a);
  });
  it("AC3: travel > JMP_ROUNDTRIP_MIN flagged, not excluded; exactly 30 is not flagged", () => {
    const { ranked } = rankSources([src(1, { travel_minutes: 30 }), src(2, { travel_minutes: 31 }), src(3, { travel_minutes: 400 })], "turbidity");
    expect(ranked.map((r) => [r.travel_minutes, r.exceeds_jmp_benchmark])).toEqual([[30, false], [31, true], [400, true]]);
  });
  it("AC4: inactive never ranked, listed in excluded", () => {
    const { ranked, excluded } = rankSources([src(1), src(2, { active: false, safety_score: 1 }), src(3)], "repair");
    expect(ranked.map((r) => r.source_id)).toEqual([id(1), id(3)]);
    expect(excluded).toEqual([{ source_id: id(2), name: "s2", type: "refill_station", reason: "inactive" }]);
  });
  it("neighboring_barangay: excluded for turbidity/drought (blended network), included for repair", () => {
    const rows = [src(1), src(2, { type: "neighboring_barangay", safety_score: 0.85, is_simulated: true, provenance: "placeholder" })];
    for (const cause of ["turbidity", "drought"]) {
      const r = rankSources(rows, cause);
      expect(r.ranked.map((x) => x.source_id)).toEqual([id(1)]);
      expect(r.excluded).toEqual([expect.objectContaining({ source_id: id(2), reason: "system_wide_cause_neighbor_blended_network" })]);
    }
    const rep = rankSources(rows, "repair");
    expect(rep.ranked.map((x) => x.source_id)).toEqual([id(1), id(2)]);
    expect(rep.excluded).toEqual([]);
  });
  it("carries provenance / is_simulated / source_ref for UI labels", () => {
    const r = rankSources([src(1, { provenance: "placeholder", is_simulated: true, source_ref: null, type: "trucking" })], "repair").ranked[0];
    expect([r.provenance, r.is_simulated, r.source_ref]).toEqual(["placeholder", true, null]);
  });
  it("empty chain -> warning no_eligible_sources; output validates against the shared-types schema", () => {
    const c = buildChain("poblacion-05", D, "turbidity", [src(1, { active: false }), src(2, { type: "neighboring_barangay" })], "2026-07-10T04:00:00.000Z");
    expect(c.ranked_sources).toEqual([]);
    expect(c.warning).toBe("no_eligible_sources");
    expect(c.excluded).toHaveLength(2);
    expect(RankedChainSchema.safeParse(c).success).toBe(true);
    const ok = buildChain("poblacion-05", D, "repair", [src(1), src(2)], "2026-07-10T04:00:00.000Z");
    expect(ok.warning).toBeUndefined();
    expect(RankedChainSchema.safeParse(ok).success).toBe(true);
  });
});

// ---- seeded data ----
function seedSources(): SourceRow[] {
  const t = readFileSync(resolve(import.meta.dirname, "../../seed/sources.sql"), "utf8");
  const re = /^ {2}\('([0-9a-f-]+)', '([a-z0-9-]+)', '((?:[^']|'')*)', '(\w+)', ([0-9.]+), (\d+), ([0-9.]+), true, '(\w+)', (null|'(?:[^']|'')*'), (true|false),/gm;
  return [...t.matchAll(re)].map((m) => ({ id: m[1], barangay_id: m[2], name: m[3], type: m[4] as SourceRow["type"], safety_score: +m[5], travel_minutes: +m[6],
    cost_php_per_unit: +m[7], active: true, provenance: m[8] as SourceRow["provenance"], source_ref: m[9] === "null" ? null : m[9], is_simulated: m[10] === "true" }));
}
describe("ranking on the seeded sources.sql", () => {
  const all = seedSources();
  it("parses all 189 rows", () => expect(all).toHaveLength(189));
  it("every barangay yields a non-empty chain for every cause, ordered per AC1", () => {
    for (const cause of ["turbidity", "drought", "repair"]) {
      for (const b of BARANGAYS) {
        const { ranked } = rankSources(all.filter((s) => s.barangay_id === b.barangay_id), cause);
        expect(ranked.length).toBeGreaterThanOrEqual(cause === "repair" ? 3 : 2);
        for (let i = 1; i < ranked.length; i++) {
          const p = ranked[i - 1], q = ranked[i];
          const k = (s: typeof p) => [-s.safety_score, s.travel_minutes, s.cost_php_per_unit];
          const cmp = k(p).map((v, j) => v - k(q)[j]).find((d) => d !== 0) ?? (p.source_id < q.source_id ? -1 : 1);
          expect(cmp).toBeLessThan(0);
        }
      }
    }
  });
  it("a far unserved barangay keeps its > 30 min refill row (flagged, not dropped)", () => {
    const { ranked } = rankSources(all.filter((s) => s.barangay_id === "albalate"), "turbidity");
    expect(ranked.some((r) => r.type === "refill_station" && r.exceeds_jmp_benchmark)).toBe(true);
  });
});

// ---- handler + persistence ----
function setup(sources: SourceRow[], d = disruption()) {
  const db = new FakeSupabase({ disruptions: [d], sources, barangays: BARANGAYS.map((b) => ({ ...b })), continuity_chains: [] });
  const store = makeDisruptionStore(db);
  const rank = makeRankStore(db);
  const logs: unknown[] = [];
  const deps = { getDisruption: store.getById, fetchBarangays: () => fetchBarangays(db), ...rank, now: () => NOW, log: (m: string, data?: unknown) => logs.push([m, data]) };
  const post = (body: unknown) => handleRankChain(new Request("http://x/rank-chain", { method: "POST", body: JSON.stringify(body) }), deps);
  return { db, post, logs };
}
describe("rank-chain handler", () => {
  const six = [src(1, { safety_score: 0.8, type: "trucking", travel_minutes: 10 }), src(2), src(3, { active: false }),
    src(4, { type: "neighboring_barangay", safety_score: 0.85 }), src(5, { type: "communal_tap", safety_score: 0.4, travel_minutes: 45 })];
  it("single mode: RankedChain, excluded listed + logged, row persisted", async () => {
    const { db, post, logs } = setup(six);
    const r = await post({ barangay_id: "poblacion-05", disruption_id: D });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ranked_sources.map((s: any) => s.source_id)).toEqual([id(2), id(1), id(5)]);
    expect(body.excluded.map((e: any) => e.reason).sort()).toEqual(["inactive", "system_wide_cause_neighbor_blended_network"]);
    expect(body.computed_at).toBe(NOW.toISOString());
    expect(RankedChainSchema.safeParse(body).success).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(db.rows("continuity_chains")).toEqual([expect.objectContaining({ barangay_id: "poblacion-05", disruption_id: D, ranked_source_ids: [id(2), id(1), id(5)] })]);
  });
  it("re-running upserts: still one row, ranked ids + computed_at replaced", async () => {
    const { db, post } = setup(six);
    await post({ barangay_id: "poblacion-05", disruption_id: D });
    db.rows("sources").find((s) => s.id === id(2))!.active = false;
    await post({ barangay_id: "poblacion-05", disruption_id: D });
    expect(db.rows("continuity_chains")).toHaveLength(1);
    expect(db.rows("continuity_chains")[0].ranked_source_ids).toEqual([id(1), id(5)]);
  });
  it("repair cause keeps the neighbor", async () => {
    const { post } = setup(six, disruption("repair"));
    const b = await (await post({ barangay_id: "poblacion-05", disruption_id: D })).json();
    expect(b.ranked_sources.map((s: any) => s.source_id)).toEqual([id(2), id(4), id(1), id(5)]);
  });
  it("no eligible source -> 200, empty chain + warning, row persisted empty", async () => {
    const { db, post } = setup([src(1, { active: false })]);
    const b = await (await post({ barangay_id: "poblacion-05", disruption_id: D })).json();
    expect(b.warning).toBe("no_eligible_sources");
    expect(b.ranked_sources).toEqual([]);
    expect(db.rows("continuity_chains")[0].ranked_source_ids).toEqual([]);
  });
  it("batch default: all 57 affected barangays at signal >= 2; one empty chain does not fail the batch", async () => {
    const rows = BARANGAYS.filter((b) => b.barangay_id !== "payao").map((b, i) => src(100 + i, { barangay_id: b.barangay_id }));
    const { db, post } = setup(rows);
    const r = await post({ disruption_id: D });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.chains).toHaveLength(57);
    expect(body.chains.filter((c: any) => c.warning === "no_eligible_sources").map((c: any) => c.barangay_id)).toEqual(["payao"]);
    expect(db.rows("continuity_chains")).toHaveLength(57);
    expect(db.calls.filter((c) => c === "upsert:continuity_chains")).toHaveLength(1);
  });
  it("batch with barangay_ids; below signal 2 and no ids -> no chains", async () => {
    const a = setup([src(1)]);
    expect((await (await a.post({ disruption_id: D, barangay_ids: ["poblacion-05", "poblacion-05"] })).json()).chains).toHaveLength(1);
    const b = setup([src(1)], disruption("turbidity", 1));
    expect((await (await b.post({ disruption_id: D })).json()).chains).toEqual([]);
  });
  it("validation: 400 bad ids / both modes, 404 unknown disruption or barangay, 405", async () => {
    const { post } = setup([src(1)]);
    expect((await post({ barangay_id: "poblacion-05", disruption_id: "x" })).status).toBe(400);
    expect((await post({ barangay_id: "poblacion-05", barangay_ids: [], disruption_id: D })).status).toBe(400);
    expect((await post({ disruption_id: D, barangay_ids: ["nope"] })).status).toBe(400);
    expect((await post({ barangay_id: "nope", disruption_id: D })).status).toBe(404);
    expect((await post({ barangay_id: "poblacion-05", disruption_id: "3f1c2a40-9b7e-4c1a-8d2e-5a6b7c8d9e99" })).status).toBe(404);
    const g = await handleRankChain(new Request("http://x/", { method: "GET" }), { } as any);
    expect(g.status).toBe(405);
  });
});

// ---- spec 03: suggested_rank + top_source ----
describe("suggested_rank", () => {
  const row = (barangay_id: string, o: any = {}) => ({ barangay_id, signal_level: 3, vulnerable_flag: false, service_level: "level_iii" as const, low_pressure_zone: false, ...o });
  it("signal desc, vulnerable, level_i before level_iii before unserved, low pressure, then id", () => {
    const m = suggestRanks([
      row("e"), row("d", { low_pressure_zone: true }), row("c", { service_level: "level_i" }), row("b", { vulnerable_flag: true }),
      row("a", { signal_level: 4 }), row("z", { service_level: "unserved" }), row("f", { signal_level: 2, vulnerable_flag: true }),
    ]);
    expect([...m.entries()].sort((x, y) => x[1] - y[1]).map(([k]) => k)).toEqual(["a", "b", "c", "d", "e", "z", "f"]);
  });
  it("buildAffectedAreas: ranks 1..57 unique with a disruption; null without; Level I first among equals", () => {
    const withD = buildAffectedAreas(BARANGAYS, { signal_level: 3, cause: "turbidity", disruption_id: D });
    expect(withD.map((a) => a.suggested_rank).sort((x, y) => x! - y!)).toEqual(Array.from({ length: 57 }, (_, i) => i + 1));
    const lvl1 = withD.filter((a) => a.service_level === "level_i").map((a) => a.suggested_rank!);
    expect(Math.max(...lvl1)).toBeLessThan(Math.min(...withD.filter((a) => a.service_level === "unserved").map((a) => a.suggested_rank!)));
    expect(buildAffectedAreas(BARANGAYS, { signal_level: 3, cause: "turbidity", disruption_id: null }).every((a) => a.suggested_rank === null && a.top_source === null)).toBe(true);
  });
});

const noLive = async () => { throw new Error("no network"); };
const stormData = async (_f: Date, to: Date) => ({
  readings: kuladorSeries(to.getTime(), 240, (h) => ({ turbidity_ntu: h < 8 ? 650 - h * 70 : 4, plant_status: "degraded" as const })),
  rainHourly: rainSeries(to.getTime(), 90 * 24, (h) => (h < 24 ? 12 : 0.1)), forecastHourly: forecastSeries(to.getTime(), 4),
});
describe("affected-areas top_source", () => {
  it("top_source = first active source of the persisted chain, null elsewhere / when the lookup fails", async () => {
    const { db, post } = setup([src(1, { safety_score: 0.8 }), src(2, { safety_score: 0.9, travel_minutes: 99, name: "far refill" })]);
    await post({ barangay_id: "poblacion-05", disruption_id: D });
    const call = (fetchTop: any) => handleAffectedAreas(new Request("http://x/f?as_of=2026-07-10T04:00:00Z"), {
      fetchData: stormData, fetchBarangays: async () => BARANGAYS, findOpen: async () => disruption() as any, getById: async () => null, now: () => NOW, fetchLive: noLive, fetchTopSources: fetchTop });
    const rows = await (await call((i: string) => fetchTopSources(db, i))).json();
    const p5 = rows.find((r: any) => r.barangay_id === "poblacion-05");
    expect(p5.top_source).toMatchObject({ source_id: id(2), name: "far refill", exceeds_jmp_benchmark: true, provenance: "osm", is_simulated: false });
    expect(typeof p5.suggested_rank).toBe("number");
    expect(rows.filter((r: any) => r.top_source).length).toBe(1);
    // deactivating the top source falls through to the next one in the persisted chain
    db.rows("sources").find((s) => s.id === id(2))!.active = false;
    expect((await (await call((i: string) => fetchTopSources(db, i))).json()).find((r: any) => r.barangay_id === "poblacion-05").top_source.source_id).toBe(id(1));
    const failing = await (await call(async () => { throw new Error("db"); })).json();
    expect(failing).toHaveLength(57);
    expect(failing.every((r: any) => r.top_source === null)).toBe(true);
  });
});
