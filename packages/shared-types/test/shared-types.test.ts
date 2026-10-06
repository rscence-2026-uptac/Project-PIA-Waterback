import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as T from "../src/index";

const U = "123e4567-e89b-42d3-a456-426614174000";
const U2 = "123e4567-e89b-42d3-a456-426614174001";
const TS = "2026-07-01T00:00:00Z";

const cases: [string, z.ZodTypeAny, unknown, unknown][] = [
  ["Reading", T.Reading,
    { id: U, recorded_at: TS, barangay_id: "p1", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 80, clarifier_inflow_lps: 40, source: "operator" },
    { id: U, recorded_at: TS, barangay_id: "p1", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 101, clarifier_inflow_lps: 40, source: "operator" }],
  ["Disruption", T.Disruption,
    { id: U, started_at: TS, resolved_at: null, cause: "repair", p_turbidity: null, p_drought: null, signal_level: 2, status: "predicted" },
    { id: U, started_at: TS, resolved_at: null, cause: "repair", p_turbidity: null, p_drought: null, signal_level: 5, status: "predicted" }],
  ["Source", T.Source,
    { id: U, barangay_id: "p1", name: "Refill", type: "refill_station", safety_score: 0.9, travel_minutes: 10, cost_php_per_unit: 5, active: true },
    { id: U, barangay_id: "p1", name: "Refill", type: "well", safety_score: 0.9, travel_minutes: 10, cost_php_per_unit: 5, active: true }],
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
    { barangay_id: "b1", name: "Poblacion", lat: 11.77, lng: 124.88, piped_households: 10, unpiped_households: 5, coverage_source: "estimate" },
    { barangay_id: "b1", name: "Poblacion", lat: 11.77, lng: 124.88, piped_households: -1, unpiped_households: 5, coverage_source: "estimate" }],
  ["Resident", T.Resident,
    { id: U, barangay_id: "b1", display_name: null, phone: "+639171234567", channel: "sms", created_at: TS },
    { id: U, barangay_id: "b1", display_name: null, phone: "09171234567", channel: "sms", created_at: TS }],
  ["WspConstant", T.WspConstant,
    { key: "TURBIDITY_SHUTDOWN_NTU", value: 500, unit: "NTU", source: "CWD 2022 WSP" },
    { key: "X", value: "500", unit: "NTU", source: "CWD 2022 WSP" }],
  ["RainfallDaily", T.RainfallDaily,
    { date: "2026-07-01", precipitation_mm: 3.2, source: "open-meteo", fetched_at: TS },
    { date: "2026-07-01", precipitation_mm: -1, source: "open-meteo", fetched_at: TS }],
  ["ReadingSeedRow", T.ReadingSeedRow,
    { recorded_at: TS, barangay_id: "p1", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 80, clarifier_inflow_lps: 40, source: "operator" },
    { recorded_at: TS, barangay_id: "p1", turbidity_ntu: 4, plant_status: "normal", reservoir_pct: 80, clarifier_inflow_lps: 40, source: "sensor" }],
  ["OpenMeteoPullConfig", T.OpenMeteoPullConfig,
    { latitude: 11.7, longitude: 124.8, start_date: "2026-06-01", end_date: "2026-07-01", daily: ["precipitation_sum"] },
    { latitude: 11.7, longitude: 124.8, start_date: "2026-06-01", end_date: "2026-07-01", daily: ["temperature"] }],
  ["TurbidityFeatures", T.TurbidityFeatures,
    { turbidity_ntu: 5, turbidity_slope_per_hr: 1, rain_24h_mm: 0, rain_72h_mm: 0, clarifier_utilization: 1 },
    { turbidity_ntu: 5, turbidity_slope_per_hr: 1, rain_24h_mm: 0, rain_72h_mm: 0, clarifier_utilization: 2.5 }],
  ["DroughtFeatures", T.DroughtFeatures,
    { reservoir_pct: 50, reservoir_trend_pct_per_day: -1, rain_14d_mm: 0, rain_30d_mm: 0, days_since_rain_over_5mm: 3 },
    { reservoir_pct: 50, reservoir_trend_pct_per_day: -1, rain_14d_mm: 0, rain_30d_mm: 0, days_since_rain_over_5mm: 1.5 }],
  ["PredictorOutput", T.PredictorOutput,
    { barangay_id: "p1", p_turbidity: 0.5, p_drought: 0.1, signal_level: 2, turbidity_level: 2, drought_level: 0, computed_at: TS, fallback_used: false },
    { barangay_id: "p1", p_turbidity: 1.5, p_drought: 0.1, signal_level: 2, turbidity_level: 2, drought_level: 0, computed_at: TS, fallback_used: false }],
  ["PredictorCoefficients", T.PredictorCoefficients,
    { bias: 0.1, weights: { turbidity_ntu: 0.2 } },
    { bias: 0.1, weights: { turbidity_ntu: "x" } }],
  ["AffectedArea", T.AffectedArea,
    { barangay_id: "p1", disruption_id: U, signal_level: 3, piped_households_affected: 1, unpiped_households_affected: 2, coverage_confidence: "estimate", vulnerable_flag: false },
    { barangay_id: "p1", disruption_id: U, signal_level: 3, piped_households_affected: 1, unpiped_households_affected: 2, coverage_confidence: "maybe", vulnerable_flag: false }],
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
  expect(T.WSP_CONSTANTS.TURBIDITY_WARNING_NTU).toBe(5);
  expect(T.WSP_CONSTANTS.TURBIDITY_SHUTDOWN_NTU).toBe(500);
  expect(T.WSP_CONSTANTS.CLARIFIER_CAPACITY_LPS).toBe(46);
  expect(T.WSP_CONSTANTS.RESERVOIR_USABLE_M3).toBe(340);
  expect(T.WSP_CONSTANTS.JMP_ROUNDTRIP_MIN).toBe(30);
  expect(T.SIGNAL_LEVEL_THRESHOLDS).toEqual([0.2, 0.4, 0.6, 0.8]);
});
