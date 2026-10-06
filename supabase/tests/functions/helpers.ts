import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { RainHourRow, ReadingRow } from "../../functions/_shared/predict.ts";

const here = import.meta.dirname;
export const REAL_VECTORS = resolve(here, "../../../ml/predictor_test_vectors.json");
export const REAL_COEFS = resolve(here, "../../../ml/predictor_coefficients.json");
const nonEmpty = (p: string) => existsSync(p) && statSync(p).size > 0;
// Real v2 files are used once they exist AND carry the v2 feature set (forecast_rain_48h_mm); otherwise a TEMP v2-shaped fixture.
const isV2 = (p: string) => nonEmpty(p) && readFileSync(p, "utf8").includes("forecast_rain_48h_mm");
export const usingReal = isV2(REAL_VECTORS) && isV2(REAL_COEFS);
export const vectorsPath = usingReal ? REAL_VECTORS : resolve(here, "fixtures/TEMP_predictor_test_vectors.json");
export const loadVectors = () => JSON.parse(readFileSync(vectorsPath, "utf8"));

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
