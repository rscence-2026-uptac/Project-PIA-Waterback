// Pure predictor logic (spec 02). No I/O, no Deno APIs: unit-tested with vitest under supabase/tests/functions.
import { SIGNAL_LEVEL_THRESHOLDS, WSP_CONSTANTS, toSignalLevel } from "./constants.generated.ts";
import { droughtRisk, turbidityRisk } from "./model.generated.ts";
import type { DroughtModelFeatures, TurbidityModelFeatures } from "./model.generated.ts";

export type TurbidityFeatures = TurbidityModelFeatures;
export type DroughtFeatures = DroughtModelFeatures;

export interface ReadingRow {
  recorded_at: string; // ISO timestamptz
  intake_id: string;
  turbidity_ntu: number;
  plant_status: "normal" | "degraded" | "shutdown";
  reservoir_pct: number | null;
  clarifier_inflow_lps: number | null;
}
export interface RainHourRow {
  ts: string; // ISO timestamptz (start of the hour)
  precipitation_mm: number;
}
export interface PredictorOutput {
  scope: "system";
  p_turbidity: number;
  p_drought: number;
  signal_level: number;
  turbidity_level: number;
  drought_level: number;
  computed_at: string;
  fallback_used: boolean;
  forecast_source: ForecastSource;
}
/** Where forecast_rain_48h_mm came from: seeded table, live Open-Meteo call, or unavailable (-> turbidity fallback). */
export type ForecastSource = "seeded" | "live" | "missing";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MANILA_OFFSET_MS = 8 * HOUR; // Asia/Manila is UTC+8 year-round (no DST)
const KULADOR = "kulador";
const CARAMAYON_1 = "caramayon_1";
const RAIN_DAY_MM = 5; // "days since rain > 5 mm" threshold (spec 02)
const FORECAST_HOURS = 48;
const READING_STALE_MS = 6 * HOUR; // newest Kulador reading must be this close to as_of (v3: no more 6-reading window / slope)
const RAIN_STALE_MS = 3 * HOUR; // newest hourly rain row must be this close to as_of
const FALLBACK_LOOKBACK_MS = DAY;
// Fallback thresholds: WSP p.43 shut-off (500) and half of it as "degraded" (matches ml/simulate_july.py's 250 rule).
const FALLBACK_DEGRADED_NTU = WSP_CONSTANTS.TURBIDITY_SHUTOFF_NTU / 2;

/** Band midpoints of SIGNAL_LEVEL_THRESHOLDS: level 0 -> 0.1 ... level 4 -> 0.9. */
export const LEVEL_MIDPOINT_P: readonly number[] = [0.1, 0.3, 0.5, 0.7, 0.9];

const t = (iso: string): number => Date.parse(iso);
/** Calendar-day index in Asia/Manila (days since epoch, local midnight boundaries). */
export const manilaDay = (ms: number): number => Math.floor((ms + MANILA_OFFSET_MS) / DAY);

function upTo(readings: ReadingRow[], intake: string, asOfMs: number): ReadingRow[] {
  return readings
    .filter((r) => r.intake_id === intake && t(r.recorded_at) <= asOfMs)
    .sort((a, b) => t(a.recorded_at) - t(b.recorded_at));
}

/** Sum of hourly rain in (asOf - windowMs, asOf]; null if no rain rows at all in the window or newest row is stale. */
function rainSum(rain: RainHourRow[], asOfMs: number, windowMs: number): number | null {
  // Hourly row stamped H counts when H is in (asOf - window, asOf] (same convention as the trainer).
  const rows = rain.filter((r) => t(r.ts) > asOfMs - windowMs && t(r.ts) <= asOfMs);
  if (rows.length === 0) return null;
  const newest = Math.max(...rows.map((r) => t(r.ts)));
  if (asOfMs - newest > RAIN_STALE_MS) return null;
  return rows.reduce((s, r) => s + r.precipitation_mm, 0);
}

/**
 * forecast_rain_48h_mm = sum of forecast hourly precipitation for hour stamps in (asOf, asOf + 48 h].
 * Requires COMPLETE coverage (all 48 hourly stamps present); returns null otherwise.
 */
export function forecastRain48h(forecast: RainHourRow[], asOf: Date): number | null {
  const asOfMs = asOf.getTime();
  const byHour = new Map<number, number>();
  for (const r of forecast) {
    const ms = t(r.ts);
    if (ms > asOfMs && ms <= asOfMs + FORECAST_HOURS * HOUR && Number.isFinite(r.precipitation_mm)) byHour.set(ms, r.precipitation_mm);
  }
  // Hour stamps (UTC hour boundaries == Manila hour boundaries, offset is whole hours) in (asOf, asOf+48h]: always 48.
  const first = Math.floor(asOfMs / HOUR) * HOUR + HOUR;
  let sum = 0;
  for (let i = 0; i < FORECAST_HOURS; i++) {
    const v = byHour.get(first + i * HOUR);
    if (v === undefined) return null;
    sum += v;
  }
  return sum;
}

/** The live forecast is only allowed for an as_of in the last 3 h of "now" (a live forecast is meaningless for the past). */
export function liveForecastAllowed(asOf: Date, now: Date): boolean {
  const d = now.getTime() - asOf.getTime();
  return d >= -60_000 && d <= RAIN_STALE_MS;
}

/** v3 (model 2026-10-06.3): turbidity_ntu, rain_24h_mm, rain_72h_mm, forecast_rain_48h_mm. null -> WSP fallback (missing turbidity/rain/forecast). */
export function buildTurbidityFeatures(readings: ReadingRow[], rainHourly: RainHourRow[], forecastRain48hMm: number | null, asOf: Date): TurbidityFeatures | null {
  const asOfMs = asOf.getTime();
  const latest = upTo(readings, KULADOR, asOfMs).pop();
  if (!latest || asOfMs - t(latest.recorded_at) > READING_STALE_MS) return null; // no recent Kulador turbidity (sensor gap)
  const rain24 = rainSum(rainHourly, asOfMs, 24 * HOUR);
  const rain72 = rainSum(rainHourly, asOfMs, 72 * HOUR);
  if (rain24 == null || rain72 == null || forecastRain48hMm == null) return null;
  return {
    turbidity_ntu: latest.turbidity_ntu,
    rain_24h_mm: rain24,
    rain_72h_mm: rain72,
    forecast_rain_48h_mm: forecastRain48hMm,
  };
}

export function buildDroughtFeatures(readings: ReadingRow[], rainHourly: RainHourRow[], asOf: Date): DroughtFeatures | null {
  const asOfMs = asOf.getTime();
  const kul = upTo(readings, KULADOR, asOfMs).filter((r) => r.reservoir_pct != null);
  const latest = kul[kul.length - 1];
  if (!latest || asOfMs - t(latest.recorded_at) > FALLBACK_LOOKBACK_MS) return null;

  const rain14 = rainSum(rainHourly, asOfMs, 14 * DAY);
  const rain30 = rainSum(rainHourly, asOfMs, 30 * DAY);
  if (rain14 == null || rain30 == null) return null;
  return {
    reservoir_pct: latest.reservoir_pct as number,
    rain_14d_mm: rain14,
    rain_30d_mm: rain30,
    days_since_rain_over_5mm: daysSinceRain(rainHourly, asOfMs),
  };
}

/**
 * Manila calendar days since the most recent day with >= 5 mm; 0 if today already has >= 5 mm. Uncapped.
 * If no day in the available history is wet, returns the number of calendar days of history (a lower bound).
 */
export function daysSinceRain(rainHourly: RainHourRow[], asOfMs: number): number {
  const today = manilaDay(asOfMs);
  const dayRain = new Map<number, number>();
  let minMs = Infinity;
  for (const r of rainHourly) {
    const ms = t(r.ts);
    if (ms > asOfMs) continue;
    if (ms < minMs) minMs = ms;
    const d = manilaDay(ms);
    dayRain.set(d, (dayRain.get(d) ?? 0) + r.precipitation_mm);
  }
  if (minMs === Infinity) return 0;
  let first = manilaDay(minMs);
  if ((minMs + MANILA_OFFSET_MS) % DAY !== 0) first += 1; // earliest day is partial: it only counts if it was itself wet
  for (let d = today; d >= manilaDay(minMs); d--) if ((dayRain.get(d) ?? 0) >= RAIN_DAY_MM) return today - d;
  return Math.max(0, today - first + 1);
}

/** WSP deterministic turbidity rule (spec 02 AC; p.43 shut-off at >= 500 NTU). */
export function turbidityFallbackLevel(readings: ReadingRow[], asOf: Date): number {
  const asOfMs = asOf.getTime();
  const recent = (intake: string) => upTo(readings, intake, asOfMs).filter((r) => asOfMs - t(r.recorded_at) <= FALLBACK_LOOKBACK_MS).pop();
  const raws = [recent(KULADOR), recent(CARAMAYON_1)].filter((r): r is ReadingRow => !!r).map((r) => r.turbidity_ntu);
  if (raws.length > 0) {
    const raw = Math.max(...raws);
    if (raw >= WSP_CONSTANTS.TURBIDITY_SHUTOFF_NTU) return 4;
    if (raw >= FALLBACK_DEGRADED_NTU) return 3;
    if (raw > WSP_CONSTANTS.TURBIDITY_LIMIT_NTU) return 1;
    return 0;
  }
  // No usable turbidity at all: fall back on the worst plant_status reported in the last 24 h.
  const statuses = readings.filter((r) => t(r.recorded_at) <= asOfMs && asOfMs - t(r.recorded_at) <= FALLBACK_LOOKBACK_MS).map((r) => r.plant_status);
  if (statuses.includes("shutdown")) return 4;
  if (statuses.includes("degraded")) return 3;
  return 0;
}

/**
 * ASSUMPTION: the CWD 2022 WSP has no drought rule (drought is our extension, spec 02).
 * These reservoir-% cut-offs are our own simple deterministic stand-in, applied only when a drought feature is missing.
 */
export function droughtFallbackLevel(readings: ReadingRow[], asOf: Date): number {
  const asOfMs = asOf.getTime();
  const kul = upTo(readings, KULADOR, asOfMs).filter((r) => r.reservoir_pct != null && asOfMs - t(r.recorded_at) <= FALLBACK_LOOKBACK_MS);
  const latest = kul[kul.length - 1];
  if (!latest) return 0; // no reservoir data: cannot claim a drought risk
  const pct = latest.reservoir_pct as number;
  if (pct < 10) return 4;
  if (pct < 20) return 3;
  if (pct < 35) return 2;
  if (pct < 50) return 1;
  return 0;
}

export function predict(input: {
  readings: ReadingRow[];
  rainHourly: RainHourRow[];
  asOf: Date;
  /** Sum of forecast rain over (asOf, asOf+48h] (see forecastRain48h), null if unavailable. Default: unavailable. */
  forecastRain48hMm?: number | null;
  forecastSource?: ForecastSource;
}): PredictorOutput {
  const { readings, rainHourly, asOf } = input;
  const fcMm = input.forecastRain48hMm ?? null;
  const forecastSource: ForecastSource = fcMm == null ? "missing" : (input.forecastSource ?? "seeded");
  let fallback = false;

  let pT: number, lT: number;
  const tf = buildTurbidityFeatures(readings, rainHourly, fcMm, asOf);
  if (tf) { pT = turbidityRisk(tf); lT = toSignalLevel(pT); }
  else { fallback = true; lT = turbidityFallbackLevel(readings, asOf); pT = LEVEL_MIDPOINT_P[lT]; }

  let pD: number, lD: number;
  const df = buildDroughtFeatures(readings, rainHourly, asOf);
  if (df) { pD = droughtRisk(df); lD = toSignalLevel(pD); }
  else { fallback = true; lD = droughtFallbackLevel(readings, asOf); pD = LEVEL_MIDPOINT_P[lD]; }

  // WSP hard rule (spec 02): >= 500 NTU at Caramayon I is a source shut-off and forces turbidity_level 4.
  const car = upTo(readings, CARAMAYON_1, asOf.getTime()).pop();
  if (car && asOf.getTime() - t(car.recorded_at) <= FALLBACK_LOOKBACK_MS && car.turbidity_ntu >= WSP_CONSTANTS.TURBIDITY_SHUTOFF_NTU && lT < 4) {
    lT = 4;
    pT = Math.max(pT, SIGNAL_LEVEL_THRESHOLDS[3]);
  }

  return {
    scope: "system",
    p_turbidity: pT,
    p_drought: pD,
    turbidity_level: lT,
    drought_level: lD,
    signal_level: Math.max(lT, lD), // never an average
    computed_at: asOf.toISOString(),
    fallback_used: fallback,
    forecast_source: forecastSource,
  };
}
