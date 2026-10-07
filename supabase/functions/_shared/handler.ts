// Request handling for disruption-predictor, with data access injected so it is testable without Deno/Supabase.
import { forecastRain48h, liveForecastAllowed, predict } from "./predict.ts";
import type { ForecastSource, PredictorOutput, RainHourRow, ReadingRow } from "./predict.ts";
import { LIVE_TIMEOUT_MS, makeLiveFetcher } from "./forecast.ts";
import type { FetchLive } from "./forecast.ts";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const LOOKBACK_MS = 90 * 24 * 3_600_000; // 90 d of daily rain history for days_since_rain_over_5mm (v2: uncapped)

export interface PredictorData {
  readings: ReadingRow[];
  rainHourly: RainHourRow[];
  /** Seeded forecast rows (rain_forecast_hourly) for (as_of, as_of + 48 h]. */
  forecastHourly?: RainHourRow[];
}
/** Optional windows for history mode; omitted = single-mode defaults (readings: last 2 d before `to`, forecast: (to, to + 48 h]). */
export interface FetchOpts { readingsFrom?: Date; forecastFrom?: Date }
export type FetchData = (from: Date, to: Date, opts?: FetchOpts) => Promise<PredictorData>;

const HOUR_MS = 3_600_000;
const MAX_HISTORY_HOURS = 72;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

/** Forecast source order: (a) seeded table with complete 48 h coverage, (b) live Open-Meteo if as_of is within 3 h of now, (c) missing. */
export async function resolveForecast(
  seeded: RainHourRow[] | undefined, asOf: Date, now: Date, fetchLive: FetchLive,
): Promise<{ mm: number | null; source: ForecastSource }> {
  const a = forecastRain48h(seeded ?? [], asOf);
  if (a != null) return { mm: a, source: "seeded" };
  if (liveForecastAllowed(asOf, now)) {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("live forecast timeout")), LIVE_TIMEOUT_MS); });
      const rows = await Promise.race([fetchLive(), timeout]).finally(() => clearTimeout(timer));
      const b = forecastRain48h(rows, asOf);
      if (b != null) return { mm: b, source: "live" };
    } catch (e) { console.warn("live forecast unavailable:", (e as Error).message); }
  }
  return { mm: null, source: "missing" };
}

export interface HistoryPoint {
  as_of: string; signal_level: number; turbidity_level: number; drought_level: number;
  fallback_used: boolean; forecast_source: ForecastSource; score_turbidity: number | null; score_drought: number | null;
}

/** score = round(50 + 10 x log-odds) when the model ran (baseline + >= 1 numeric contribution), else null (WSP fallback). */
function modelScore(p: PredictorOutput, model: "turbidity" | "drought"): number | null {
  const bias = p.drivers?.baseline[model];
  const nums = (p.drivers?.[model] ?? []).filter((d) => d.feature !== "wsp_rule" && typeof d.contribution === "number");
  if (bias === undefined || nums.length === 0) return null;
  return Math.round(50 + 10 * (bias + nums.reduce((s, d) => s + (d.contribution as number), 0))) || 0;
}

function historyPoint(t: Date, p: PredictorOutput): HistoryPoint {
  return {
    as_of: t.toISOString(), signal_level: p.signal_level, turbidity_level: p.turbidity_level, drought_level: p.drought_level,
    fallback_used: p.fallback_used, forecast_source: p.forecast_source,
    score_turbidity: modelScore(p, "turbidity"), score_drought: modelScore(p, "drought"),
  };
}

export async function handleRequest(
  req: Request, fetchData: FetchData, now: () => Date = () => new Date(), fetchLive: FetchLive = makeLiveFetcher(),
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "method not allowed" });

  let raw: unknown = new URL(req.url).searchParams.get("as_of");
  if (raw == null && req.method === "POST") {
    try { raw = ((await req.json()) as { as_of?: unknown } | null)?.as_of ?? null; }
    catch { return json(400, { error: "invalid JSON body" }); }
  }
  // An unencoded "+08:00" in a query string arrives as " 08:00"; restore the plus.
  if (typeof raw === "string") raw = raw.replace(/ /g, "+");
  let asOf: Date;
  if (raw == null || raw === "") asOf = now();
  else {
    // Require a full ISO 8601 timestamp with explicit offset or Z (a bare date/datetime would be timezone-ambiguous).
    const ok = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(raw);
    asOf = new Date(ok ? (raw as string) : NaN);
    if (!ok || Number.isNaN(asOf.getTime())) return json(400, { error: "as_of must be an ISO 8601 timestamp with offset, e.g. 2026-07-02T06:00:00+08:00" });
  }

  // history mode: ?history_hours=N (integer 1..72) returns N+1 hourly points ending at as_of.
  const hRaw = new URL(req.url).searchParams.get("history_hours");
  let historyHours: number | null = null;
  if (hRaw != null) {
    if (!/^\d+$/.test(hRaw) || Number(hRaw) < 1 || Number(hRaw) > MAX_HISTORY_HOURS) {
      return json(400, { error: `history_hours must be an integer from 1 to ${MAX_HISTORY_HOURS}` });
    }
    historyHours = Number(hRaw);
  }

  if (historyHours != null) {
    try {
      const startMs = asOf.getTime() - historyHours * HOUR_MS;
      const data = await fetchData(new Date(startMs - LOOKBACK_MS), asOf, {
        readingsFrom: new Date(startMs - 2 * 24 * HOUR_MS),
        forecastFrom: new Date(startMs),
      });
      const hours: HistoryPoint[] = [];
      for (let i = 0; i < historyHours; i++) { // seeded forecast only: no live call for past points
        const t = new Date(startMs + i * HOUR_MS);
        const mm = forecastRain48h(data.forecastHourly ?? [], t);
        hours.push(historyPoint(t, predict({ readings: data.readings, rainHourly: data.rainHourly, asOf: t, forecastRain48hMm: mm, forecastSource: "seeded" })));
      }
      const fc = await resolveForecast(data.forecastHourly, asOf, now(), fetchLive); // newest point: same chain as single mode
      hours.push(historyPoint(asOf, predict({ readings: data.readings, rainHourly: data.rainHourly, asOf, forecastRain48hMm: fc.mm, forecastSource: fc.source })));
      return json(200, { as_of: asOf.toISOString(), history_hours: historyHours, hours });
    } catch (e) {
      console.error("disruption-predictor history failed", e);
      return json(500, { error: "failed to compute prediction" });
    }
  }

  try {
    const data = await fetchData(new Date(asOf.getTime() - LOOKBACK_MS), asOf);
    const fc = await resolveForecast(data.forecastHourly, asOf, now(), fetchLive);
    return json(200, predict({ readings: data.readings, rainHourly: data.rainHourly, asOf, forecastRain48hMm: fc.mm, forecastSource: fc.source }));
  } catch (e) {
    console.error("disruption-predictor failed", e);
    return json(500, { error: "failed to compute prediction" });
  }
}
