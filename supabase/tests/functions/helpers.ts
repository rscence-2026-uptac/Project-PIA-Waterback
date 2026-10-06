import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RainHourRow, ReadingRow } from "../../functions/_shared/predict.ts";

const here = import.meta.dirname;
// v3 files (model 2026-10-06.3): turbidity = turbidity_ntu, rain_24h_mm, rain_72h_mm, forecast_rain_48h_mm.
export const VECTORS_PATH = resolve(here, "../../../ml/predictor_test_vectors.json");
export const COEFS_PATH = resolve(here, "../../../ml/predictor_coefficients.json");
export const loadVectors = () => JSON.parse(readFileSync(VECTORS_PATH, "utf8"));
export const loadCoefs = () => JSON.parse(readFileSync(COEFS_PATH, "utf8"));

export const HOUR = 3_600_000;
export const iso = (ms: number) => new Date(ms).toISOString();

/** Hourly Kulador readings ending at `endMs` (inclusive), going back `n` hours, value fn gets hours-before-end. */
export function kuladorSeries(endMs: number, n: number, f: (h: number) => Partial<ReadingRow> = () => ({})): ReadingRow[] {
  const out: ReadingRow[] = [];
  for (let h = n - 1; h >= 0; h--) {
    out.push({ recorded_at: iso(endMs - h * HOUR), intake_id: "kulador", turbidity_ntu: 4, plant_status: "normal",
      reservoir_pct: 80, clarifier_inflow_lps: 23.15, ...f(h) });
  }
  return out;
}
export function rainSeries(endMs: number, n: number, f: (h: number) => number): RainHourRow[] {
  const out: RainHourRow[] = [];
  for (let h = n - 1; h >= 0; h--) out.push({ ts: iso(endMs - h * HOUR), precipitation_mm: f(h) });
  return out;
}
/** Hourly forecast rows covering (asOfMs, asOfMs + 48 h] with the given mm per hour. */
export function forecastSeries(asOfMs: number, mmPerHour = 0.25, hours = 48): RainHourRow[] {
  const out: RainHourRow[] = [];
  for (let i = 1; i <= hours; i++) out.push({ ts: iso(asOfMs + i * HOUR), precipitation_mm: mmPerHour });
  return out;
}
