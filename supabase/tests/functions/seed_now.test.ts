// Verifies scripts/demo/seed_now_lib.mjs against the REAL predictor: the seeded "now" scenario must reproduce the web
// app's sample prediction (apps/web/src/data/mock.ts OPERATOR_PREDICTION) at as_of = H and keep the model running through the hold.
import { describe, expect, it } from "vitest";
// @ts-ignore plain .mjs module
import { buildScenario, expectedFeatures, parseHold, DEMO_NOW_SOURCE, DEMO_NOW_PREFIX } from "../../../scripts/demo/seed_now_lib.mjs";
import { buildDroughtFeatures, buildTurbidityFeatures, forecastRain48h, predict } from "../../functions/_shared/predict.ts";
import type { ReadingRow, RainHourRow } from "../../functions/_shared/predict.ts";

const HOUR = 3_600_000;
const ANCHOR = new Date("2026-10-08T04:37:12Z"); // 12:37 Manila -> H = 12:00 Manila
const sc = buildScenario(ANCHOR);
const H: Date = sc.H;
const readings = sc.readings as ReadingRow[];
const rainHourly = sc.rainfall.map((r: any) => ({ ts: r.ts, precipitation_mm: r.precipitation_mm })) as RainHourRow[];
const forecastRows = sc.forecast.map((r: any) => ({ ts: r.ts, precipitation_mm: r.precipitation_mm })) as RainHourRow[];
const run = (asOf: Date) => predict({ readings, rainHourly, asOf, forecastRain48hMm: forecastRain48h(forecastRows, asOf), forecastSource: "seeded" });

describe("seed-now scenario vs the real predictor", () => {
  it("anchor is floored to the hour", () => {
    expect(H.toISOString()).toBe("2026-10-08T04:00:00.000Z");
  });
  it("model inputs at H", () => {
    const tf = buildTurbidityFeatures(readings, rainHourly, forecastRain48h(forecastRows, H), H)!;
    expect(tf.turbidity_ntu).toBe(620);
    expect(tf.rain_24h_mm).toBeCloseTo(43, 6);
    expect(tf.rain_72h_mm).toBeCloseTo(55, 6);
    expect(tf.forecast_rain_48h_mm).toBeCloseTo(14, 6);
    const df = buildDroughtFeatures(readings, rainHourly, H)!;
    expect(df.reservoir_pct).toBe(58);
    expect(df.rain_14d_mm).toBeCloseTo(160, 6);
    expect(df.rain_30d_mm).toBeCloseTo(310, 6);
    expect(df.days_since_rain_over_5mm).toBe(0);
    expect(expectedFeatures(sc, H).rain_14d_mm).toBeCloseTo(160, 6);
  });
  it("prediction at H = sample (turbidity 4, drought 0, signal 4, no fallback)", () => {
    const p = run(H);
    expect(p.turbidity_level).toBe(4);
    expect(p.drought_level).toBe(0);
    expect(p.signal_level).toBe(4);
    expect(p.fallback_used).toBe(false);
    expect(p.forecast_source).toBe("seeded");
  });
  it("model still runs (no fallback, still level 4) through the hold: H+11h", () => {
    const p = run(new Date(H.getTime() + 11 * HOUR));
    expect(p.fallback_used).toBe(false);
    expect(p.turbidity_level).toBe(4);
  });
  it("early-morning anchor (02:00 Manila): days-since-rain is 1 but the outcome is unchanged", () => {
    const e = buildScenario(new Date("2026-10-07T18:20:00Z")); // 02:00 Manila
    const rh = e.rainfall.map((r: any) => ({ ts: r.ts, precipitation_mm: r.precipitation_mm })) as RainHourRow[];
    const fc = e.forecast.map((r: any) => ({ ts: r.ts, precipitation_mm: r.precipitation_mm })) as RainHourRow[];
    const p = predict({ readings: e.readings as ReadingRow[], rainHourly: rh, asOf: e.H, forecastRain48hMm: forecastRain48h(fc, e.H), forecastSource: "seeded" });
    expect(buildDroughtFeatures(e.readings as ReadingRow[], rh, e.H)!.days_since_rain_over_5mm).toBe(1);
    expect([p.turbidity_level, p.drought_level, p.signal_level, p.fallback_used]).toEqual([4, 0, 4, false]);
  });
  it("latest per intake matches the sample", () => {
    const last = (id: string) => readings.filter((r) => r.intake_id === id && Date.parse(r.recorded_at) <= H.getTime()).pop() as any;
    expect(last("kulador")).toMatchObject({ turbidity_ntu: 620, plant_status: "degraded", treated_turbidity_ntu: 3.8, clarifier_inflow_lps: 31, reservoir_pct: 58 });
    expect(last("masacpasac")).toMatchObject({ turbidity_ntu: 14, plant_status: "normal" });
    expect(last("caramayon_1")).toMatchObject({ turbidity_ntu: 540, plant_status: "shutdown" });
    expect(last("caramayon_2")).toMatchObject({ turbidity_ntu: 38, plant_status: "normal" });
  });
  it("hourly trend H-48h..H rises into Very high (>= 64), not flat", () => {
    const rows: string[] = [];
    const tScores: number[] = [], dScores: number[] = [];
    for (let k = -48; k <= 0; k++) {
      const p = run(new Date(H.getTime() + k * HOUR));
      expect(p.fallback_used).toBe(false);
      const sc = (items: any[], base: number) => 50 + 10 * (base + items.reduce((s, d) => s + (typeof d.contribution === "number" ? d.contribution : 0), 0));
      const t = sc(p.drivers!.turbidity.filter((d: any) => d.feature !== "wsp_rule"), p.drivers!.baseline.turbidity!);
      const d = sc(p.drivers!.drought, p.drivers!.baseline.drought!);
      tScores.push(t); dScores.push(d);
      rows.push(`${String(k).padStart(4)}h  turb ${t.toFixed(0).padStart(4)}  drought ${d.toFixed(0).padStart(4)}  L${p.turbidity_level}/${p.drought_level}`);
    }
    console.log("seed-now hourly score trend (50+10*logit):\n" + rows.join("\n"));
    expect(tScores[0]).toBeLessThan(64);
    expect(tScores[tScores.length - 1]).toBeGreaterThanOrEqual(64);
    expect(tScores[0]).toBeLessThan(tScores[tScores.length - 1] - 10);
  });
  it("tagging and shapes", () => {
    expect(sc.rainfall.every((r: any) => r.source === DEMO_NOW_SOURCE)).toBe(true);
    expect(sc.forecast.every((r: any) => r.source === DEMO_NOW_SOURCE)).toBe(true);
    expect(sc.readings.every((r: any) => r.is_simulated === true && r.source === "sensor" && r.client_local_id.startsWith(DEMO_NOW_PREFIX))).toBe(true);
    expect(new Set(sc.readings.map((r: any) => r.client_local_id)).size).toBe(sc.readings.length);
    expect(new Set(sc.rainfall.map((r: any) => r.ts)).size).toBe(sc.rainfall.length);
    expect(sc.readings.length).toBe(4 * (48 + 12 + 1));
    expect(sc.readings.filter((r: any) => r.intake_id !== "kulador").every((r: any) => r.reservoir_pct === null && r.clarifier_inflow_lps === null)).toBe(true);
    expect(parseHold("6h")).toBe(6);
    expect(() => parseHold("0h")).toThrow();
  });
});
