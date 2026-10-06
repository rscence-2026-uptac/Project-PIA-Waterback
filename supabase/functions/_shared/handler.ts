// Request handling for disruption-predictor, with data access injected so it is testable without Deno/Supabase.
import { forecastRain48h, liveForecastAllowed, predict } from "./predict.ts";
import type { ForecastSource, RainHourRow, ReadingRow } from "./predict.ts";
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
export type FetchData = (from: Date, to: Date) => Promise<PredictorData>;

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

  try {
    const data = await fetchData(new Date(asOf.getTime() - LOOKBACK_MS), asOf);
    const fc = await resolveForecast(data.forecastHourly, asOf, now(), fetchLive);
    return json(200, predict({ readings: data.readings, rainHourly: data.rainHourly, asOf, forecastRain48hMm: fc.mm, forecastSource: fc.source }));
  } catch (e) {
    console.error("disruption-predictor failed", e);
    return json(500, { error: "failed to compute prediction" });
  }
}
