import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as T from "../src/index";

const U = "123e4567-e89b-42d3-a456-426614174000";
const U2 = "123e4567-e89b-42d3-a456-426614174001";
const TS = "2026-07-01T00:00:00Z";

const cases: [string, z.ZodTypeAny, unknown, unknown][] = [
  ["Reading", T.Reading,
    { id: U, recorded_at: TS, intake_id: "kulador", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 80, clarifier_inflow_lps: 40, source: "operator" },
    { id: U, recorded_at: TS, intake_id: "kulador", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 101, clarifier_inflow_lps: 40, source: "operator" }],
  ["Disruption", T.Disruption,
    { id: U, started_at: TS, resolved_at: null, cause: "repair", p_turbidity: null, p_drought: null, signal_level: 2, status: "predicted" },
    { id: U, started_at: TS, resolved_at: null, cause: "repair", p_turbidity: null, p_drought: null, signal_level: 5, status: "predicted" }],
  ["Source", T.Source,
    { id: U, barangay_id: "p1", name: "Refill", type: "refill_station", safety_score: 0.9, travel_minutes: 10, cost_php_per_unit: 5, active: true },
    { id: U, barangay_id: "p1", name: "Refill", type: "well", safety_score: 0.9, travel_minutes: 10, cost_php_per_unit: 5, active: true }],
  ["Source (provenance)", T.Source,
    { id: U, barangay_id: "p1", name: "Refill", type: "refill_station", safety_score: 0.9, travel_minutes: 10, cost_php_per_unit: 25, active: true, provenance: "osm", source_ref: "https://www.openstreetmap.org/node/1", is_simulated: false, lat: 11.77, lng: 124.88 },
    { id: U, barangay_id: "p1", name: "Refill", type: "refill_station", safety_score: 0.9, travel_minutes: 10, cost_php_per_unit: 25, active: true, provenance: "guess", is_simulated: false }],
  ["ContinuityChain", T.ContinuityChain,
    { id: U, barangay_id: "p1", disruption_id: U, ranked_source_ids: [U2], computed_at: TS },
    { id: U, barangay_id: "p1", disruption_id: U, ranked_source_ids: ["nope"], computed_at: TS }],
  ["Allocation", T.Allocation,
    { id: U, disruption_id: U, barangay_id: "p1", priority_rank: 1, officer_id: "o", decided_at: TS },
    { id: U, disruption_id: U, barangay_id: "p1", priority_rank: 0, officer_id: "o", decided_at: TS }],
  ["EventLog", T.EventLog,
    { id: U, disruption_id: U, event_type: "resolved", actor: "system", occurred_at: TS, payload_json: { a: 1 } },
    { id: U, disruption_id: U, event_type: "bogus", actor: "system", occurred_at: TS }],
  ["Barangay", T.Barangay,
    { barangay_id: "b1", name: "Poblacion", lat: 11.77, lng: 124.88, piped_households: 10, unpiped_households: 5, coverage_source: "estimate", zone: 3 },
    { barangay_id: "b1", name: "Poblacion", lat: 11.77, lng: 124.88, piped_households: -1, unpiped_households: 5, coverage_source: "estimate", zone: 3 }],
  ["Resident", T.Resident,
    { id: U, barangay_id: "b1", display_name: null, phone: "+639171234567", channel: "sms", created_at: TS },
    { id: U, barangay_id: "b1", display_name: null, phone: "09171234567", channel: "sms", created_at: TS }],
  ["WspConstant", T.WspConstant,
    { key: "TURBIDITY_SHUTOFF_NTU", value: 500, unit: "NTU", source: "CWD 2022 WSP" },
    { key: "X", value: "500", unit: "NTU", source: "CWD 2022 WSP" }],
  ["RainfallDaily", T.RainfallDaily,
    { date: "2026-07-01", precipitation_mm: 3.2, source: "open-meteo", fetched_at: TS },
    { date: "2026-07-01", precipitation_mm: -1, source: "open-meteo", fetched_at: TS }],
  ["RainfallHourly", T.RainfallHourly,
    { ts: "2026-07-01T00:00:00+08:00", precipitation_mm: 0.4, source: "open-meteo" },
    { ts: "2026-07-01T00:00:00+08:00", precipitation_mm: -0.1, source: "open-meteo" }],
  ["RainForecastHourly", T.RainForecastHourly,
    { ts: "2026-07-01T00:00:00+08:00", precipitation_mm: 0.4, source: "open-meteo-historical-forecast" },
    { ts: "2026-07-01T00:00:00+08:00", precipitation_mm: -0.1, source: "open-meteo-historical-forecast" }],
  ["ReadingSeedRow", T.ReadingSeedRow,
    { recorded_at: TS, intake_id: "kulador", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 80, clarifier_inflow_lps: 40, source: "operator", is_simulated: true },
    { recorded_at: TS, intake_id: "kulador", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 80, clarifier_inflow_lps: 40, source: "operator", is_simulated: false }],
  ["OpenMeteoPullConfig", T.OpenMeteoPullConfig,
    { latitude: 11.7, longitude: 124.8, start_date: "2026-06-01", end_date: "2026-07-01", daily: ["precipitation_sum"] },
    { latitude: 11.7, longitude: 124.8, start_date: "2026-06-01", end_date: "2026-07-01", daily: ["temperature"] }],
  ["TurbidityFeatures", T.TurbidityFeatures,
    { turbidity_ntu: 5, rain_24h_mm: 0, rain_72h_mm: 0, forecast_rain_48h_mm: 12.5 },
    { turbidity_ntu: 5, rain_24h_mm: 0, rain_72h_mm: 0, forecast_rain_48h_mm: -1 }],
  ["DroughtFeatures", T.DroughtFeatures,
    { reservoir_pct: 50, rain_14d_mm: 0, rain_30d_mm: 0, days_since_rain_over_5mm: 3 },
    { reservoir_pct: 50, rain_14d_mm: 0, rain_30d_mm: 0, days_since_rain_over_5mm: 1.5 }],
  ["PredictorOutput", T.PredictorOutput,
    { scope: "system", p_turbidity: 0.5, p_drought: 0.1, signal_level: 2, turbidity_level: 2, drought_level: 0, computed_at: TS, fallback_used: false },
    { scope: "system", p_turbidity: 1.5, p_drought: 0.1, signal_level: 2, turbidity_level: 2, drought_level: 0, computed_at: TS, fallback_used: false }],
  ["PredictorCoefficients", T.PredictorCoefficients,
    { bias: 0.1, weights: { turbidity_ntu: 0.2 } },
    { bias: 0.1, weights: { turbidity_ntu: "x" } }],
  ["AffectedArea", T.AffectedArea,
    { barangay_id: "p1", zone: 8, service_level: "level_iii", low_pressure_zone: true, disruption_id: U, signal_level: 3, piped_households_affected: 1, unpiped_households_affected: 2, coverage_confidence: "estimate", vulnerable_flag: false },
    { barangay_id: "p1", zone: 8, service_level: "level_iii", low_pressure_zone: true, disruption_id: U, signal_level: 3, piped_households_affected: 1, unpiped_households_affected: 2, coverage_confidence: "maybe", vulnerable_flag: false }],
  ["RankSourcesInput", T.RankSourcesInput,
    { barangay_id: "p1", disruption_id: U },
    { barangay_id: "p1", disruption_id: "not-uuid" }],
  ["RankedSource", T.RankedSource,
    { source_id: U, name: "n", type: "trucking", safety_score: 0.5, travel_minutes: 40, exceeds_jmp_benchmark: true, cost_php_per_unit: 1, rank: 1 },
    { source_id: U, name: "n", type: "trucking", safety_score: 0.5, travel_minutes: 40, exceeds_jmp_benchmark: true, cost_php_per_unit: 1, rank: 0 }],
  ["RankedChain", T.RankedChain,
    { barangay_id: "p1", disruption_id: U, ranked_sources: [], computed_at: TS },
    { barangay_id: "p1", disruption_id: U, ranked_sources: [{}], computed_at: TS }],
  ["AllocationDecision", T.AllocationDecision,
    { disruption_id: U, barangay_id: "p1", priority_rank: 1, officer_id: "o", overridden_from_suggested_rank: null },
    { disruption_id: U, barangay_id: "p1", priority_rank: 1, officer_id: "o" }],
  ["DeployResponse", T.DeployResponse,
    { disruption_id: U, barangay_id: "p1", source_id: U2, deployed_by: "o", deployed_at: TS },
    { disruption_id: U, barangay_id: "p1", source_id: "x", deployed_by: "o", deployed_at: TS }],
  ["NotificationPayload", T.NotificationPayload,
    { disruption_id: U, barangay_id: "p1", channel: "sms", status: "s", cause: "drought", store_water_advice: true, nearest_source_name: "n", sent_at: TS },
    { disruption_id: U, barangay_id: "p1", channel: "email", status: "s", cause: "drought", store_water_advice: true, nearest_source_name: "n", sent_at: TS }],
  ["ResidentConfirmation", T.ResidentConfirmation,
    { disruption_id: U, barangay_id: "p1", confirmed_by: "resident", channel: "pwa", restored: false, confirmed_at: TS },
    { disruption_id: U, barangay_id: "p1", confirmed_by: "mayor", channel: "pwa", restored: false, confirmed_at: TS }],
  ["EventLogEntry", T.EventLogEntry,
    { disruption_id: U, event_type: "deployed", actor: "o", occurred_at: TS },
    { disruption_id: U, event_type: "predicted", actor: "o", occurred_at: TS }],
];

describe.each(cases)("%s", (_n, schema, good, bad) => {
  it("parses a valid fixture", () => expect(schema.safeParse(good).success).toBe(true));
  it("rejects an invalid fixture", () => expect(schema.safeParse(bad).success).toBe(false));
});

it("Barangay defaults critical_facilities to []", () => {
  const p = T.Barangay.parse((cases.find((c) => c[0] === "Barangay")![2]) as object);
  expect(p.critical_facilities).toEqual([]);
});

describe("toSignalLevel", () => {
  it.each([
    [0, 0], [0.1999, 0], [0.2, 1], [0.4, 2], [0.5999, 2], [0.6, 3], [0.8, 4], [1, 4],
  ])("p=%s -> %s", (p, lvl) => expect(T.toSignalLevel(p)).toBe(lvl));
});

it("WSP_CONSTANTS values", () => {
  const C = T.WSP_CONSTANTS;
  expect(C.TURBIDITY_LIMIT_NTU).toBe(5);
  expect(C.TURBIDITY_SHUTOFF_NTU).toBe(500);
  expect(C.CLARIFIER_CAPACITY_CMD).toBe(4000);
  expect(C.CLARIFIER_CAPACITY_LPS).toBe(46.3);
  expect(C.RESERVOIR_TOTAL_M3).toBe(440);
  expect(C.RESERVOIR_FIRE_RESERVE_M3).toBe(100);
  expect(C.RESERVOIR_USABLE_M3).toBe(340);
  expect(C.JMP_ROUNDTRIP_MIN).toBe(30);
  expect(C.SERVED_BARANGAYS).toBe(26);
  expect(C.SERVICE_ZONES).toBe(10);
  expect(C.LOW_PRESSURE_ZONES).toEqual([8, 10]);
  expect(T.SIGNAL_LEVEL_THRESHOLDS).toEqual([0.2, 0.4, 0.6, 0.8]);
});

it("isLowPressureZone", () => {
  expect(T.isLowPressureZone(8)).toBe(true);
  expect(T.isLowPressureZone(10)).toBe(true);
  expect(T.isLowPressureZone(null)).toBe(false);
  expect(T.isLowPressureZone(3)).toBe(false);
});

const intake = { intake_id: "kulador", name: "Kulador", type: "surface", rated_capacity_lps: null, treated_at_kulador: true, power_dependent: false, wsp_page: "p.13" };
const brgy = { barangay_id: "b1", name: "P", zone: 3, lat: 1, lng: 1, piped_households: 1, unpiped_households: 1, coverage_source: "estimate" };
const reading = { id: U, recorded_at: TS, intake_id: "kulador", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 80, clarifier_inflow_lps: 40, source: "operator" };

describe("contract edge cases", () => {
  it("Intake valid/invalid", () => {
    expect(T.Intake.safeParse(intake).success).toBe(true);
    expect(T.Intake.safeParse({ ...intake, type: "river" }).success).toBe(false);
    expect(T.INTAKE_IDS).toEqual(["kulador", "masacpasac", "caramayon_1", "caramayon_2"]);
  });
  it("Barangay zone/nullables", () => {
    expect(T.Barangay.safeParse({ ...brgy, zone: 11 }).success).toBe(false);
    expect(T.Barangay.safeParse({ ...brgy, zone: null }).success).toBe(true);
    expect(T.Barangay.safeParse({ ...brgy, piped_households: null, unpiped_households: null, lat: null, lng: null }).success).toBe(true);
    expect(T.Barangay.parse(brgy).service_level).toBe("level_iii");
  });
  it("Reading nullables / intake_id", () => {
    expect(T.Reading.safeParse({ ...reading, reservoir_pct: null, clarifier_inflow_lps: null }).success).toBe(true);
    const { intake_id: _i, ...noIntake } = reading;
    expect(T.Reading.safeParse(noIntake).success).toBe(false);
  });
  it("is_simulated flag", () => {
    const { is_simulated: _s, ...noFlag } = reading as Record<string, unknown>;
    expect(T.Reading.parse(noFlag).is_simulated).toBe(false);
    const seed = { recorded_at: TS, intake_id: "kulador", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 80, clarifier_inflow_lps: 40, source: "operator" };
    expect(T.ReadingSeedRow.safeParse({ ...seed, is_simulated: true }).success).toBe(true);
    expect(T.ReadingSeedRow.safeParse({ ...seed, is_simulated: false }).success).toBe(false);
    expect(T.ReadingSeedRow.safeParse(seed).success).toBe(false);
  });
  it("PredictorOutput scope", () => {
    const po = { scope: "system", p_turbidity: 0.5, p_drought: 0.1, signal_level: 2, turbidity_level: 2, drought_level: 0, computed_at: TS, fallback_used: false };
    expect(T.PredictorOutput.safeParse(po).success).toBe(true);
    expect(T.PredictorOutput.safeParse({ ...po, scope: "barangay" }).success).toBe(false);
  });
  it("PredictorOutput forecast_source is optional and constrained", () => {
    const po = { scope: "system", p_turbidity: 0.5, p_drought: 0.1, signal_level: 2, turbidity_level: 2, drought_level: 0, computed_at: TS, fallback_used: false };
    for (const f of ["seeded", "live", "missing"]) expect(T.PredictorOutput.safeParse({ ...po, forecast_source: f }).success).toBe(true);
    expect(T.PredictorOutput.safeParse(po).success).toBe(true); // omitted: still valid
    expect(T.PredictorOutput.safeParse({ ...po, forecast_source: "guess" }).success).toBe(false);
  });
});

describe("Dev B handoff 2026-10-06 schema changes", () => {
  const dis = { id: U, started_at: TS, resolved_at: null, cause: "turbidity", p_turbidity: 0.7, p_drought: 0.1, signal_level: 3, status: "confirmed" };
  const ev = { id: U, disruption_id: U, event_type: "confirmed", actor: "system", occurred_at: TS };
  const aa = { barangay_id: "p1", zone: null, service_level: "level_iii", low_pressure_zone: false, disruption_id: U, signal_level: 3, piped_households_affected: null, unpiped_households_affected: null, coverage_confidence: "unknown", vulnerable_flag: false };

  it("Reading treated_turbidity_ntu / client_local_id", () => {
    expect(T.Reading.parse(reading).treated_turbidity_ntu).toBeNull();
    expect(T.Reading.parse(reading).client_local_id).toBeNull();
    const r = T.Reading.parse({ ...reading, treated_turbidity_ntu: 2.5, client_local_id: "local-1" });
    expect(r.treated_turbidity_ntu).toBe(2.5);
    expect(r.client_local_id).toBe("local-1");
    expect(T.Reading.safeParse({ ...reading, treated_turbidity_ntu: -1 }).success).toBe(false);
  });
  it("EventLog barangay_id nullable + client_local_id", () => {
    expect(T.EventLog.parse(ev).barangay_id).toBeNull();
    expect(T.EventLog.parse({ ...ev, barangay_id: "p1", client_local_id: "c1" })).toMatchObject({ barangay_id: "p1", client_local_id: "c1" });
    expect(T.EventLog.safeParse({ ...ev, barangay_id: 5 }).success).toBe(false);
  });
  it("Disruption timing fields default null and accept datetimes", () => {
    const d = T.Disruption.parse(dis);
    for (const k of ["window_start", "window_end", "likely_at", "next_update_at", "heads_up_from"] as const) expect(d[k]).toBeNull();
    expect(T.Disruption.parse({ ...dis, window_start: TS, window_end: TS, likely_at: TS, next_update_at: TS, heads_up_from: TS }).likely_at).toBe(TS);
    expect(T.Disruption.safeParse({ ...dis, likely_at: "5pm" }).success).toBe(false);
  });
  it("Barangay wsp_name", () => {
    expect(T.Barangay.parse(brgy).wsp_name).toBeNull();
    expect(T.Barangay.parse({ ...brgy, wsp_name: "Darahuway Dako" }).wsp_name).toBe("Darahuway Dako");
    expect(T.Barangay.parse({ ...brgy, service_level: "unserved", zone: null, piped_households: null }).service_level).toBe("unserved");
  });
  it("AffectedArea household counts nullable", () => {
    expect(T.AffectedArea.safeParse(aa).success).toBe(true);
    expect(T.AffectedArea.safeParse({ ...aa, piped_households_affected: -1 }).success).toBe(false);
    expect(T.AffectedArea.safeParse({ ...aa, unpiped_households_affected: undefined }).success).toBe(false);
  });
  it("zod 4 string formats", () => {
    expect(T.RainfallDaily.safeParse({ date: "2026-13-01", precipitation_mm: 1 }).success).toBe(false);
    expect(T.RainfallHourly.safeParse({ ts: "2026-07-01T00:00:00", precipitation_mm: 1 }).success).toBe(false); // offset required
    expect(T.PredictorCoefficients.safeParse({ bias: 0, weights: { a: 1 } }).success).toBe(true);
  });
});

describe("residentState", () => {
  it.each([
    [0, "turbidity", "level_iii", "flowing", false],
    [1, "turbidity", "level_iii", "heads_up", true],
    [2, "drought", "level_i", "heads_up", true],
    [3, "turbidity", "level_iii", "interrupted", false],
    [4, "drought", "level_i", "interrupted", false],
    [3, "repair", "level_iii", "planned_repair", false],
    [4, "repair", "level_i", "planned_repair", false],
    [1, "repair", "level_iii", "heads_up", true],
    [0, null, "level_iii", "flowing", false],
    [0, null, "unserved", "not_on_network", false],
    [1, "turbidity", "unserved", "not_on_network", false],
    [2, "turbidity", "unserved", "not_on_network", true],
    [4, "repair", "unserved", "not_on_network", true],
  ] as const)("signal %s cause %s %s -> %s heads_up=%s", (sig, cause, svc, state, heads) =>
    expect(T.residentState(sig, cause, svc)).toEqual({ state, heads_up: heads }));
});

describe("datetime inputs accept offsets", () => {
  const alloc = { id: U, disruption_id: U, barangay_id: "p1", priority_rank: 1, officer_id: "o" };
  it("+08:00 accepted and same instant as Z; garbage rejected", () => {
    const a = T.Allocation.parse({ ...alloc, decided_at: "2026-07-01T08:00:00+08:00" });
    expect(Date.parse(a.decided_at)).toBe(Date.parse("2026-07-01T00:00:00Z"));
    expect(T.Allocation.safeParse({ ...alloc, decided_at: "2026-07-01T00:00:00Z" }).success).toBe(true);
    for (const bad of ["garbage", "2026-07-01", "2026-07-01 08:00:00", "2026-13-01T00:00:00Z"])
      expect(T.Allocation.safeParse({ ...alloc, decided_at: bad }).success).toBe(false);
  });
});

describe("spec 04 extras + spec 03 endpoint extras (all optional, non-breaking)", () => {
  const RS = { source_id: U, name: "n", type: "refill_station", safety_score: 0.9, travel_minutes: 12, exceeds_jmp_benchmark: false, cost_php_per_unit: 25, rank: 1 };
  it("RankedSource accepts provenance/is_simulated/source_ref and still parses without them", () => {
    expect(T.RankedSource.safeParse(RS).success).toBe(true);
    expect(T.RankedSource.safeParse({ ...RS, provenance: "osm", is_simulated: false, source_ref: "https://osm.org/node/1" }).success).toBe(true);
    expect(T.RankedSource.safeParse({ ...RS, provenance: "rumor" }).success).toBe(false);
  });
  it("RankedChain: excluded + warning", () => {
    const base = { barangay_id: "p1", disruption_id: U, ranked_sources: [], computed_at: TS };
    const ex = { source_id: U, name: "n", type: "neighboring_barangay", reason: "system_wide_cause_neighbor_blended_network" };
    expect(T.RankedChain.safeParse({ ...base, excluded: [ex], warning: "no_eligible_sources" }).success).toBe(true);
    expect(T.RankedChain.safeParse({ ...base, excluded: [{ ...ex, reason: "meh" }] }).success).toBe(false);
    expect(T.RankedChain.safeParse({ ...base, warning: "other" }).success).toBe(false);
  });
  it("RankSourcesBatchInput: barangay_ids optional", () => {
    expect(T.RankSourcesBatchInput.safeParse({ disruption_id: U }).success).toBe(true);
    expect(T.RankSourcesBatchInput.safeParse({ disruption_id: U, barangay_ids: ["a"] }).success).toBe(true);
    expect(T.RankSourcesBatchInput.safeParse({ disruption_id: "x" }).success).toBe(false);
  });
  it("AffectedArea: suggested_rank/top_source optional, nullable disruption_id", () => {
    const aa = { barangay_id: "p1", zone: 8, service_level: "level_iii", low_pressure_zone: true, disruption_id: null, signal_level: 3, piped_households_affected: null, unpiped_households_affected: null, coverage_confidence: "unknown", vulnerable_flag: false };
    expect(T.AffectedArea.safeParse(aa).success).toBe(true);
    const top = { source_id: U, name: "n", type: "trucking", safety_score: 0.8, travel_minutes: 10, exceeds_jmp_benchmark: false, cost_php_per_unit: 0, provenance: "placeholder", is_simulated: true };
    expect(T.AffectedArea.safeParse({ ...aa, disruption_id: U, suggested_rank: 1, top_source: top }).success).toBe(true);
    expect(T.AffectedArea.safeParse({ ...aa, suggested_rank: null, top_source: null }).success).toBe(true);
    expect(T.AffectedArea.safeParse({ ...aa, suggested_rank: 0 }).success).toBe(false);
  });
});

describe("TurbidityFeatures v3", () => {
  it("has exactly the four v3 features (no turbidity_slope_per_hr) and strips the old key", () => {
    expect(Object.keys(T.TurbidityFeatures.shape)).toEqual(["turbidity_ntu", "rain_24h_mm", "rain_72h_mm", "forecast_rain_48h_mm"]);
    const out = T.TurbidityFeatures.parse({ turbidity_ntu: 5, turbidity_slope_per_hr: 1, rain_24h_mm: 0, rain_72h_mm: 0, forecast_rain_48h_mm: 1 });
    expect("turbidity_slope_per_hr" in out).toBe(false);
    expect(T.TurbidityFeatures.safeParse({ turbidity_ntu: 5, rain_24h_mm: 0, rain_72h_mm: 0 }).success).toBe(false);
  });
});
