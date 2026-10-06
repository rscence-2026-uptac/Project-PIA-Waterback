// Specs 03 / 07 + disruption lifecycle: affected-areas, disruption-monitor, dashboard-snapshot (data access mocked, fixtures exported from pia_dev).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AffectedArea } from "../../../packages/shared-types/src/index.ts";
import { buildAffectedAreas, handleAffectedAreas } from "../../functions/_shared/affected.ts";
import type { BarangayRow } from "../../functions/_shared/affected.ts";
import { buildSnapshot, handleSnapshot, statusAfter } from "../../functions/_shared/dashboard_snapshot.ts";
import type { EventRow } from "../../functions/_shared/dashboard_snapshot.ts";
import { confirmDisruption, handleMonitor, HORIZON_MS } from "../../functions/_shared/disruption_monitor.ts";
import { fetchBarangays, fetchEvents, fetchServed, makeDisruptionStore, makeFetchData } from "../../functions/_shared/supabase_data.ts";
import { FakeSupabase } from "./fakeSupabase.ts";
import { forecastSeries, kuladorSeries, rainSeries } from "./helpers.ts";

const BARANGAYS: BarangayRow[] = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/barangays_pia_dev.json"), "utf8"));
const NOW = new Date("2026-07-10T04:00:00Z");
const U = "3f1c2a40-9b7e-4c1a-8d2e-5a6b7c8d9e01";

// ---- predictor data: calm (signal 0) vs. high turbidity at Kulador (>= 500 NTU fallback path is not needed: forecast + slope present) ----
const calmData = async (_f: Date, to: Date) => ({
  readings: kuladorSeries(to.getTime(), 240), rainHourly: rainSeries(to.getTime(), 90 * 24, (h) => (h >= 96 && h < 120 ? 10 : 0.2)), forecastHourly: forecastSeries(to.getTime(), 0.05),
});
// Rising turbidity to 650 NTU and heavy rain -> turbidity model fires (verified by the signal assertion below).
const stormData = async (_f: Date, to: Date) => ({
  readings: kuladorSeries(to.getTime(), 240, (h) => ({ turbidity_ntu: h < 8 ? 650 - h * 70 : 4, plant_status: "degraded" as const })),
  rainHourly: rainSeries(to.getTime(), 90 * 24, (h) => (h < 24 ? 12 : 0.1)), forecastHourly: forecastSeries(to.getTime(), 4),
});
const noLive = async () => { throw new Error("no network"); };

const withBarangays = (patch: Record<string, Partial<BarangayRow>>) => BARANGAYS.map((b) => ({ ...b, ...(patch[b.barangay_id] ?? {}) }));

describe("fixtures", () => {
  it("57 barangays, 26 served, 31 unserved", () => {
    expect(BARANGAYS).toHaveLength(57);
    expect(BARANGAYS.filter((b) => b.service_level !== "unserved")).toHaveLength(26);
  });
  it("storm data really reaches signal >= 2", async () => {
    const r = await handleAffectedAreas(new Request("http://x/f?as_of=2026-07-10T04:00:00Z"), {
      fetchData: stormData, fetchBarangays: async () => BARANGAYS, findOpen: async () => null, getById: async () => null, now: () => NOW, fetchLive: noLive });
    expect((await r.json())[0].signal_level).toBeGreaterThanOrEqual(2);
  });
});

describe("spec 03 buildAffectedAreas", () => {
  const ctx = (signal_level: number, extra = {}) => ({ signal_level, cause: "turbidity" as const, disruption_id: U, ...extra });
  it("signal >= 2: returns all 57; all 26 served inherit the signal", () => {
    const out = buildAffectedAreas(BARANGAYS, ctx(3, { min_signal: 2 }));
    expect(out).toHaveLength(57);
    const served = out.filter((a) => a.service_level !== "unserved");
    expect(served).toHaveLength(26);
    expect(served.every((a) => a.signal_level === 3 && a.resident_state === "interrupted" && a.heads_up === false)).toBe(true);
  });
  it("min_signal filter: signal below threshold returns nothing", () => {
    expect(buildAffectedAreas(BARANGAYS, ctx(1, { min_signal: 2 }))).toEqual([]);
    expect(buildAffectedAreas(BARANGAYS, ctx(1))).toHaveLength(57);
  });
  it("unserved -> not_on_network, heads_up only at signal >= 2", () => {
    const un = (s: number) => buildAffectedAreas(BARANGAYS, ctx(s)).filter((a) => a.service_level === "unserved");
    expect(un(1).every((a) => a.resident_state === "not_on_network" && !a.heads_up)).toBe(true);
    expect(un(2).every((a) => a.resident_state === "not_on_network" && a.heads_up)).toBe(true);
    expect(un(4).every((a) => a.heads_up && a.piped_households_affected === null && a.coverage_confidence === "unknown")).toBe(true);
  });
  it("repair cause -> planned_repair for served; signal 1-2 -> heads_up", () => {
    expect(buildAffectedAreas(BARANGAYS, { ...ctx(4), cause: "repair" }).find((a) => a.service_level === "level_iii")!.resident_state).toBe("planned_repair");
    expect(buildAffectedAreas(BARANGAYS, ctx(2)).find((a) => a.service_level === "level_iii")!.resident_state).toBe("heads_up");
  });
  it("null counts or unknown source -> coverage unknown, no guessed numbers", () => {
    const out = buildAffectedAreas(withBarangays({ maulong: { piped_households: 100, unpiped_households: null, coverage_source: "estimate" },
      canlapwas: { piped_households: 760, unpiped_households: 60, coverage_source: "unknown" } }), ctx(4));
    for (const id of ["maulong", "canlapwas"]) {
      const a = out.find((x) => x.barangay_id === id)!;
      expect(a.coverage_confidence).toBe("unknown");
      expect([a.piped_households_affected, a.unpiped_households_affected]).toEqual([null, null]);
    }
  });
  it("estimate / confirmed counts pass through; Level I counts everything as unpiped", () => {
    const out = buildAffectedAreas(withBarangays({
      mercedes: { piped_households: 640, unpiped_households: 50, coverage_source: "estimate" },
      "san-andres": { piped_households: 580, unpiped_households: 30, coverage_source: "cwd_service_map" },
      payao: { piped_households: 300, unpiped_households: 90, coverage_source: "estimate" } }), ctx(4));
    const g = (id: string) => out.find((x) => x.barangay_id === id)!;
    expect(g("mercedes")).toMatchObject({ piped_households_affected: 640, unpiped_households_affected: 50, coverage_confidence: "estimate" });
    expect(g("san-andres").coverage_confidence).toBe("confirmed");
    expect(g("payao")).toMatchObject({ service_level: "level_i", piped_households_affected: 0, unpiped_households_affected: 390 });
  });
  it("low_pressure_zone true only for zones 8 and 10; vulnerable_flag from critical facilities", () => {
    const patch: Record<string, Partial<BarangayRow>> = { mercedes: { zone: 8 }, maulong: { zone: 10 }, canlapwas: { zone: 3, critical_facilities: ["school"] } };
    const out = buildAffectedAreas(withBarangays(patch), ctx(4));
    const g = (id: string) => out.find((x) => x.barangay_id === id)!;
    expect([g("mercedes").low_pressure_zone, g("maulong").low_pressure_zone, g("canlapwas").low_pressure_zone]).toEqual([true, true, false]);
    expect([g("canlapwas").vulnerable_flag, g("mercedes").vulnerable_flag]).toEqual([true, false]);
  });
  it("rows validate against shared-types AffectedArea (when a disruption exists)", () => {
    for (const a of buildAffectedAreas(BARANGAYS, ctx(4))) expect(AffectedArea.parse(a)).toBeTruthy();
  });
  it("disruption_id is null when none is open (documented contract change)", () => {
    const out = buildAffectedAreas(BARANGAYS, { signal_level: 0, cause: null, disruption_id: null });
    expect(out.every((a) => a.disruption_id === null)).toBe(true);
    expect(AffectedArea.safeParse(out[0]).success).toBe(false); // old non-null contract rejects it: spec 03 changed
  });
});

describe("affected-areas handler", () => {
  const deps = (data = stormData, open: any = null, byId: any = null) => ({
    fetchData: data, fetchBarangays: async () => BARANGAYS, findOpen: async () => open, getById: async () => byId, now: () => NOW, fetchLive: noLive });
  const get = (url: string, d = deps(), init?: RequestInit) => handleAffectedAreas(new Request(url, init), d);
  it("OPTIONS / 405 / CORS", async () => {
    expect((await get("http://x/f", deps(), { method: "OPTIONS" })).status).toBe(204);
    expect((await get("http://x/f", deps(), { method: "POST" })).status).toBe(405);
    expect((await get("http://x/f")).headers.get("access-control-allow-origin")).toBe("*");
  });
  it("validates as_of, min_signal, disruption_id", async () => {
    expect((await get("http://x/f?as_of=nope")).status).toBe(400);
    expect((await get("http://x/f?min_signal=9")).status).toBe(400);
    expect((await get("http://x/f?disruption_id=zzz")).status).toBe(400);
    expect((await get(`http://x/f?disruption_id=${U}`)).status).toBe(404);
  });
  it("storm: returns 57 rows, open disruption id + its cause used", async () => {
    const open = { id: U, cause: "repair" };
    const rows = await (await get("http://x/f?as_of=2026-07-10T04:00:00Z&min_signal=2", deps(stormData, open))).json();
    expect(rows).toHaveLength(57);
    expect(rows.every((r: any) => r.disruption_id === U)).toBe(true);
    expect(rows.find((r: any) => r.service_level === "level_iii").resident_state).toBe("planned_repair"); // cause comes from the disruption, not the model
  });
  it("calm: min_signal=2 -> [], no min_signal -> 57 rows with null disruption_id", async () => {
    expect(await (await get("http://x/f?min_signal=2", deps(calmData))).json()).toEqual([]);
    const rows = await (await get("http://x/f", deps(calmData))).json();
    expect(rows).toHaveLength(57);
    expect(rows[0]).toMatchObject({ disruption_id: null, signal_level: 0 });
  });
  it("works over the supabase data layer (fake client)", async () => {
    const db = new FakeSupabase({ barangays: BARANGAYS, disruptions: [], readings: [], rainfall_hourly: [], rain_forecast_hourly: [] });
    const store = makeDisruptionStore(db);
    const r = await handleAffectedAreas(new Request("http://x/f?as_of=2026-07-10T04:00:00Z"), {
      fetchData: makeFetchData(db), fetchBarangays: () => fetchBarangays(db), findOpen: store.findOpen, getById: store.getById, now: () => NOW, fetchLive: noLive });
    expect(r.status).toBe(200);
    expect(await r.json()).toHaveLength(57);
  });
});

describe("disruption-monitor", () => {
  const AS = "2026-07-10T04:00:00Z";
  const setup = (data = stormData) => {
    const db = new FakeSupabase({ disruptions: [], event_log: [] });
    const deps = { fetchData: data, store: makeDisruptionStore(db), now: () => NOW, fetchLive: noLive };
    const post = (body: unknown) => handleMonitor(new Request("http://x/f", { method: "POST", body: JSON.stringify(body) }), deps);
    return { db, post, deps };
  };
  it("signal < 2 and nothing open: no row, no event", async () => {
    const { db, post } = setup(calmData);
    const b = await (await post({ as_of: AS })).json();
    expect(b).toMatchObject({ action: "none", disruption: null });
    expect(db.rows("disruptions")).toHaveLength(0);
  });
  it("signal >= 2: creates a predicted disruption + system-wide 'predicted' event", async () => {
    const { db, post } = setup();
    const b = await (await post({ as_of: AS })).json();
    expect(b.action).toBe("created");
    expect(b.prediction.signal_level).toBeGreaterThanOrEqual(2);
    const d = db.rows("disruptions")[0];
    expect(d).toMatchObject({ status: "predicted", started_at: new Date(AS).toISOString(), cause: "turbidity", signal_level: b.prediction.signal_level });
    expect(Date.parse(d.window_end) - Date.parse(AS)).toBe(HORIZON_MS.turbidity);
    expect(Date.parse(d.likely_at) - Date.parse(AS)).toBe(HORIZON_MS.turbidity / 2);
    expect(d.heads_up_from).toBe(b.prediction.signal_level <= 2 ? new Date(AS).toISOString() : null);
    expect(Date.parse(d.next_update_at)).toBeGreaterThan(Date.parse(AS));
    const ev = db.rows("event_log");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ event_type: "predicted", disruption_id: d.id, barangay_id: null, actor: "system" });
  });
  it("idempotent: same as_of twice = one disruption, one event, second call 'unchanged'", async () => {
    const { db, post } = setup();
    await post({ as_of: AS });
    const b2 = await (await post({ as_of: AS })).json();
    expect(b2.action).toBe("unchanged");
    expect(db.rows("disruptions")).toHaveLength(1);
    expect(db.rows("event_log")).toHaveLength(1);
  });
  it("later as_of with an open disruption updates it, never creates a second", async () => {
    const { db, post } = setup();
    await post({ as_of: AS });
    const b = await (await post({ as_of: "2026-07-10T06:00:00Z" })).json();
    expect(b.action).toBe("updated");
    expect(db.rows("disruptions")).toHaveLength(1);
    expect(db.rows("disruptions")[0].next_update_at).toBe("2026-07-10T08:00:00.000Z");
    expect(db.rows("event_log")).toHaveLength(1);
  });
  it("signal change on an open disruption is written; status untouched", async () => {
    const { db, post } = setup();
    await post({ as_of: AS });
    db.rows("disruptions")[0].signal_level = 2; db.rows("disruptions")[0].status = "deployed";
    const b = await (await post({ as_of: AS })).json();
    expect(b.action).toBe("updated");
    expect(db.rows("disruptions")[0].status).toBe("deployed");
    expect(db.rows("disruptions")[0].signal_level).toBe(b.prediction.signal_level);
  });
  it("resolved disruptions don't count as open: a new one is created", async () => {
    const { db, post } = setup();
    await post({ as_of: AS });
    db.rows("disruptions")[0].status = "resolved";
    expect((await (await post({ as_of: "2026-07-11T04:00:00Z" })).json()).action).toBe("created");
    expect(db.rows("disruptions")).toHaveLength(2);
  });
  it("losing an insert race adopts the winner instead of duplicating", async () => {
    const { db, post } = setup();
    db.failNextInsert.disruptions = true;
    db.beforeInsert.disruptions = () => { db.rows("disruptions").push({ id: U, status: "predicted", started_at: AS, cause: "turbidity", signal_level: 3 }); };
    const b = await (await post({ as_of: AS })).json();
    expect(b.action).toBe("unchanged");
    expect(b.disruption.id).toBe(U);
    expect(db.rows("disruptions")).toHaveLength(1);
  });
  it("confirm: predicted -> confirmed + one 'confirmed' event; repeat is a no-op", async () => {
    const { db, post } = setup();
    const id = (await (await post({ as_of: AS })).json()).disruption.id;
    const c = await (await post({ action: "confirm", disruption_id: id, actor: "R. Abella" })).json();
    expect(c).toMatchObject({ action: "confirmed", disruption: { id, status: "confirmed" } });
    const again = await (await post({ action: "confirm", disruption_id: id })).json();
    expect(again.action).toBe("unchanged");
    const ev = db.rows("event_log").filter((e) => e.event_type === "confirmed");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ actor: "R. Abella", barangay_id: null, disruption_id: id });
    // a monitor tick after confirm keeps status 'confirmed'
    await post({ as_of: AS });
    expect(db.rows("disruptions")[0].status).toBe("confirmed");
  });
  it("confirm: unknown id 404, resolved 409, bad id 400; confirmDisruption leaves later states alone", async () => {
    const { db, post } = setup();
    expect((await post({ action: "confirm", disruption_id: U })).status).toBe(404);
    expect((await post({ action: "confirm", disruption_id: "x" })).status).toBe(400);
    db.rows("disruptions").push({ id: U, status: "resolved" });
    expect((await post({ action: "confirm", disruption_id: U })).status).toBe(409);
    db.rows("disruptions")[0].status = "notified";
    const r = await confirmDisruption(makeDisruptionStore(db), U.replace("1c2a40", "1c2a40"), "x", NOW);
    expect(r).toMatchObject({ status: 200, action: "unchanged" });
    expect(db.rows("disruptions")[0].status).toBe("notified");
  });
  it("request validation, CORS", async () => {
    const { post, deps } = setup();
    expect((await post({ as_of: "bad" })).status).toBe(400);
    expect((await post({ action: "x" })).status).toBe(400);
    expect((await handleMonitor(new Request("http://x/f", { method: "GET" }), deps)).status).toBe(405);
    expect((await handleMonitor(new Request("http://x/f", { method: "POST", body: "{" }), deps)).status).toBe(400);
    const o = await handleMonitor(new Request("http://x/f", { method: "OPTIONS" }), deps);
    expect(o.status).toBe(204);
    expect(o.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("spec 07 dashboard snapshot", () => {
  const served = BARANGAYS.filter((b) => b.service_level !== "unserved") as { barangay_id: string; service_level: "level_iii" | "level_i" }[];
  const disruption: any = { id: U, started_at: "2026-07-10T02:00:00.000Z", resolved_at: null, cause: "turbidity", signal_level: 4, status: "confirmed" };
  const ev = (event_type: EventRow["event_type"], at: string, barangay_id: string | null = null, payload_json: any = null): EventRow => ({ event_type, occurred_at: at, barangay_id, payload_json });
  const row = (s: ReturnType<typeof buildSnapshot>, id: string) => s.barangays.find((b) => b.barangay_id === id)!;

  it("statusAfter maps event types to card status", () => {
    expect(statusAfter({ event_type: "deployed", payload_json: null })).toBe("deployed");
    expect(statusAfter({ event_type: "resident_confirmed", payload_json: { restored: true } })).toBe("resolved");
    expect(statusAfter({ event_type: "resident_confirmed", payload_json: { restored: false } })).toBe("confirmed");
    expect(statusAfter({ event_type: "resident_confirmed", payload_json: null })).toBe("confirmed");
  });
  it("one row per served barangay (26); system events fan out to all", () => {
    const s = buildSnapshot(served, disruption, [ev("predicted", "2026-07-10T02:00:00.000Z"), ev("confirmed", "2026-07-10T03:00:00.000Z")], NOW);
    expect(s.barangays).toHaveLength(26);
    expect(s.barangays.every((b) => b.status === "confirmed" && b.signal_level === 4 && b.last_event_at === "2026-07-10T03:00:00.000Z" && b.resident_state === "interrupted")).toBe(true);
    expect(s.generated_at).toBe(NOW.toISOString());
    expect(s.disruption).toBe(disruption);
  });
  it("per-barangay events apply only to that barangay; restored=true -> resolved at signal 0", () => {
    const s = buildSnapshot(served, disruption, [
      ev("confirmed", "2026-07-10T03:00:00.000Z"),
      ev("deployed", "2026-07-10T04:00:00.000Z", "canlapwas"),
      ev("notified", "2026-07-10T04:05:00.000Z", "canlapwas"),
      ev("notified", "2026-07-10T04:06:00.000Z", "mercedes"),
      ev("resident_confirmed", "2026-07-10T05:00:00.000Z", "mercedes", { restored: true }),
      ev("resident_confirmed", "2026-07-10T05:10:00.000Z", "canlapwas", { restored: false }),
    ], NOW);
    expect(row(s, "canlapwas")).toMatchObject({ status: "confirmed", signal_level: 4, last_event_at: "2026-07-10T05:10:00.000Z" });
    expect(row(s, "mercedes")).toMatchObject({ status: "resolved", signal_level: 0, resident_state: "flowing" });
    expect(row(s, "maulong")).toMatchObject({ status: "confirmed", signal_level: 4, last_event_at: "2026-07-10T03:00:00.000Z" });
  });
  it("events given out of order are sorted; no events -> predicted at started_at", () => {
    const s = buildSnapshot(served, disruption, [ev("notified", "2026-07-10T04:00:00.000Z", "payao"), ev("deployed", "2026-07-10T03:00:00.000Z", "payao")], NOW);
    expect(row(s, "payao").status).toBe("notified");
    const empty = buildSnapshot(served, { ...disruption, status: "predicted" }, [], NOW);
    expect(row(empty, "payao")).toMatchObject({ status: "predicted", last_event_at: disruption.started_at });
  });
  it("heads-up phase: signal 2 -> resident_state heads_up", () => {
    const s = buildSnapshot(served, { ...disruption, signal_level: 2, status: "predicted" }, [], NOW);
    expect(row(s, "payao").resident_state).toBe("heads_up");
  });
  it("no open disruption: signal 0, resolved, last_event_at = generated_at, disruption null", () => {
    const s = buildSnapshot(served, null, [], NOW);
    expect(s.disruption).toBeNull();
    expect(s.barangays.every((b) => b.signal_level === 0 && b.status === "resolved" && b.last_event_at === NOW.toISOString())).toBe(true);
  });
  it("matches Dev B's DashboardSnapshot shape field by field (zod 3 re-statement of spec 07)", async () => {
    const { z } = await import("zod");
    const Snap = z.object({ barangays: z.array(z.object({ barangay_id: z.string(), signal_level: z.number().int().min(0).max(4),
      status: z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]), last_event_at: z.string().datetime() })), generated_at: z.string().datetime() });
    expect(Snap.parse(buildSnapshot(served, disruption, [ev("deployed", "2026-07-10T04:00:00.000Z", "payao")], NOW)).barangays).toHaveLength(26);
    expect(Snap.parse(buildSnapshot(served, null, [], NOW)).barangays).toHaveLength(26);
  });
  it("handler over the supabase data layer (fake client): only served barangays, newest open disruption, its events", async () => {
    const db = new FakeSupabase({
      barangays: BARANGAYS,
      disruptions: [{ ...disruption, status: "resolved" }, { ...disruption, id: "11111111-1111-4111-8111-111111111111", started_at: "2026-07-09T00:00:00.000Z", status: "resolved" }, { ...disruption, id: "22222222-2222-4222-8222-222222222222" }],
      event_log: [
        { id: "a", disruption_id: "22222222-2222-4222-8222-222222222222", event_type: "confirmed", barangay_id: null, occurred_at: "2026-07-10T03:00:00.000Z", payload_json: null },
        { id: "b", disruption_id: "22222222-2222-4222-8222-222222222222", event_type: "deployed", barangay_id: "payao", occurred_at: "2026-07-10T03:30:00.000Z", payload_json: null },
        { id: "c", disruption_id: U, event_type: "resolved", barangay_id: null, occurred_at: "2026-07-10T09:00:00.000Z", payload_json: null },
      ] });
    const store = makeDisruptionStore(db);
    const r = await handleSnapshot(new Request("http://x/f"), { fetchServed: () => fetchServed(db), findOpen: store.findOpen, fetchEvents: (id) => fetchEvents(db, id), now: () => NOW });
    expect(r.status).toBe(200);
    const s = await r.json();
    expect(s.disruption.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(s.barangays).toHaveLength(26);
    expect(s.barangays.find((b: any) => b.barangay_id === "payao")).toMatchObject({ status: "deployed" });
    expect(s.barangays.find((b: any) => b.barangay_id === "maulong")).toMatchObject({ status: "confirmed" });
    expect(s.barangays.find((b: any) => b.barangay_id === "new-mahayag")).toBeUndefined();
    expect((await handleSnapshot(new Request("http://x/f", { method: "POST" }), { fetchServed: async () => [], findOpen: async () => null, fetchEvents: async () => [] })).status).toBe(405);
  });
});
