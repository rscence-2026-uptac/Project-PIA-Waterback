import { describe, expect, it } from "vitest";
import { PredictorOutput } from "../../../packages/shared-types/src/index.ts";
import { droughtFallbackLevel, predict, turbidityFallbackLevel } from "../../functions/_shared/predict.ts";
import type { ReadingRow } from "../../functions/_shared/predict.ts";
import { HOUR, kuladorSeries, rainSeries } from "./helpers.ts";

const ASOF = Date.parse("2026-07-10T12:00:00+08:00");
const asOf = new Date(ASOF);
const rain = rainSeries(ASOF, 90 * 24, () => 0.1);
const FC = { forecastRain48hMm: 12, forecastSource: "seeded" as const };
const P = (x: Parameters<typeof predict>[0]) => predict({ ...FC, ...x });
const one = (o: Partial<ReadingRow>, ago = 0): ReadingRow[] => kuladorSeries(ASOF - ago * HOUR, 1, () => o);
const car = (ntu: number): ReadingRow => ({ ...kuladorSeries(ASOF, 1)[0], intake_id: "caramayon_1", turbidity_ntu: ntu });

describe("turbidity fallback levels (WSP rule)", () => {
  it.each([[4, 0], [5, 0], [5.1, 1], [249, 1], [250, 3], [499, 3], [500, 4], [800, 4]])("kulador %f NTU -> level %i", (ntu, lvl) => {
    expect(turbidityFallbackLevel(one({ turbidity_ntu: ntu }), asOf)).toBe(lvl);
  });
  it("uses max of Kulador and Caramayon I", () => {
    expect(turbidityFallbackLevel([...one({ turbidity_ntu: 4 }), car(520)], asOf)).toBe(4);
  });
  it("no turbidity in last 24h -> plant_status", () => {
    const old = (s: ReadingRow["plant_status"]) => ({ ...one({ plant_status: s }, 30)[0], intake_id: "masacpasac" });
    expect(turbidityFallbackLevel([old("shutdown")], asOf)).toBe(0); // older than 24h: ignored
    const recent = (s: ReadingRow["plant_status"]) => ({ ...one({ plant_status: s })[0], intake_id: "masacpasac" });
    expect(turbidityFallbackLevel([recent("shutdown")], asOf)).toBe(4);
    expect(turbidityFallbackLevel([recent("degraded")], asOf)).toBe(3);
    expect(turbidityFallbackLevel([recent("normal")], asOf)).toBe(0);
    expect(turbidityFallbackLevel([], asOf)).toBe(0);
  });
});

describe("drought fallback levels (ASSUMED rule)", () => {
  it.each([[9.9, 4], [10, 3], [19.9, 3], [20, 2], [34.9, 2], [35, 1], [49.9, 1], [50, 0], [90, 0]])("reservoir %f%% -> level %i", (pct, lvl) => {
    expect(droughtFallbackLevel(one({ reservoir_pct: pct }), asOf)).toBe(lvl);
  });
  it("no reservoir data -> 0", () => expect(droughtFallbackLevel([], asOf)).toBe(0));
});

describe("predict()", () => {
  const full = kuladorSeries(ASOF, 10 * 24);
  const bands: [number, number][] = [[0, 0.1], [1, 0.3], [2, 0.5], [3, 0.7], [4, 0.9]];

  it("model path: no fallback, schema-valid, p from model", () => {
    const o = P({ readings: full, rainHourly: rain, asOf });
    expect(o.fallback_used).toBe(false);
    expect(PredictorOutput.parse(o)).toEqual(o);
    expect(o.computed_at).toBe("2026-07-10T04:00:00.000Z");
    expect(o.signal_level).toBe(Math.max(o.turbidity_level, o.drought_level));
  });
  it("sensor gap -> turbidity fallback; p is band midpoint", () => {
    const gap = full.filter((r) => r.recorded_at !== new Date(ASOF - 2 * HOUR).toISOString());
    const o = P({ readings: gap, rainHourly: rain, asOf });
    expect(o.fallback_used).toBe(true);
    expect(o.turbidity_level).toBe(0);
    expect(o.p_turbidity).toBe(0.1);
    expect(PredictorOutput.safeParse(o).success).toBe(true);
  });
  it.each([[600, 4], [300, 3], [20, 1]])("gap + %f NTU -> level %i with midpoint p", (ntu, lvl) => {
    const gap = kuladorSeries(ASOF, 10 * 24, (h) => (h === 0 ? { turbidity_ntu: ntu } : {})).filter((r) => r.recorded_at !== new Date(ASOF - 2 * HOUR).toISOString());
    const o = P({ readings: gap, rainHourly: rain, asOf });
    expect(o.turbidity_level).toBe(lvl);
    expect(o.p_turbidity).toBe(bands[lvl][1]);
    expect(o.signal_level).toBeGreaterThanOrEqual(lvl);
  });
  it("missing rain -> both fallbacks, no data -> all zeros", () => {
    const o = P({ readings: full, rainHourly: [], asOf });
    expect(o.fallback_used).toBe(true);
    const e = predict({ readings: [], rainHourly: [], asOf });
    expect(e).toMatchObject({ turbidity_level: 0, drought_level: 0, signal_level: 0, fallback_used: true, p_turbidity: 0.1, p_drought: 0.1 });
  });
  it("drought fallback by reservoir level when rain history is missing", () => {
    const o = P({ readings: kuladorSeries(ASOF, 8, () => ({ reservoir_pct: 15 })), rainHourly: [], asOf });
    expect(o.drought_level).toBe(3);
    expect(o.p_drought).toBe(0.7);
    expect(o.fallback_used).toBe(true);
  });
  it("drought model path with only a few readings (reservoir trend is gone)", () => {
    const o = P({ readings: kuladorSeries(ASOF, 8, () => ({ reservoir_pct: 15 })), rainHourly: rain, asOf });
    expect(o.p_drought).not.toBe(0.7);
    expect(o.fallback_used).toBe(false);
  });
  it("missing clarifier inflow does NOT trigger fallback (not a model input)", () => {
    const o = P({ readings: kuladorSeries(ASOF, 10 * 24, () => ({ clarifier_inflow_lps: null })), rainHourly: rain, asOf });
    expect(o.fallback_used).toBe(false);
  });
  describe("forecast source", () => {
    it("seeded -> model path, forecast_source=seeded, forecast changes p", () => {
      const lo = predict({ readings: full, rainHourly: rain, asOf, forecastRain48hMm: 0, forecastSource: "seeded" });
      const hi = predict({ readings: full, rainHourly: rain, asOf, forecastRain48hMm: 200, forecastSource: "seeded" });
      expect(lo.forecast_source).toBe("seeded");
      expect(lo.fallback_used).toBe(false);
      expect(hi.p_turbidity).toBeGreaterThan(lo.p_turbidity);
      expect(PredictorOutput.parse(hi)).toEqual(hi);
    });
    it("live -> model path, forecast_source=live", () => {
      const o = predict({ readings: full, rainHourly: rain, asOf, forecastRain48hMm: 5, forecastSource: "live" });
      expect(o.forecast_source).toBe("live");
      expect(o.fallback_used).toBe(false);
    });
    it("missing -> turbidity WSP fallback (fallback_used, midpoint p), drought still on the model", () => {
      const o = predict({ readings: full, rainHourly: rain, asOf });
      expect(o.forecast_source).toBe("missing");
      expect(o.fallback_used).toBe(true);
      expect(o.p_turbidity).toBe(0.1);
      expect(o.turbidity_level).toBe(0);
      expect(o.p_drought).not.toBe(0.1);
    });
    it("missing forecast + high raw turbidity -> WSP level from raw NTU", () => {
      const rs = kuladorSeries(ASOF, 10 * 24, (h) => (h === 0 ? { turbidity_ntu: 300 } : {}));
      const o = predict({ readings: rs, rainHourly: rain, asOf });
      expect(o.turbidity_level).toBe(3);
      expect(o.fallback_used).toBe(true);
    });
  });
  it("signal_level = max, never average", () => {
    const o = P({ readings: [...kuladorSeries(ASOF, 8, () => ({ reservoir_pct: 5 })), car(10)], rainHourly: rain, asOf });
    expect(o.drought_level).toBe(4);
    expect(o.signal_level).toBe(Math.max(o.turbidity_level, o.drought_level));
    expect(o.signal_level).toBe(4);
  });
  it("Caramayon I >= 500 NTU forces turbidity_level 4 even on the model path", () => {
    const o = P({ readings: [...full, car(650)], rainHourly: rain, asOf });
    expect(o.turbidity_level).toBe(4);
    expect(o.p_turbidity).toBeGreaterThanOrEqual(0.8);
    expect(o.signal_level).toBe(4);
  });
});
