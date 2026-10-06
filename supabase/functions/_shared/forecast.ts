// Live Open-Meteo forecast fallback (no Deno-specific APIs; fetch is injectable for tests).
import type { RainHourRow } from "./predict.ts";

export const LIVE_FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=11.7769&longitude=124.8852&hourly=precipitation&forecast_days=3&past_days=1&timezone=Asia%2FManila";
export const LIVE_TIMEOUT_MS = 5000;

export type FetchLive = () => Promise<RainHourRow[]>;

/** Fetches the hourly forecast from Open-Meteo (Manila local timestamps -> ISO with +08:00). Throws on timeout/HTTP/shape errors. */
export function makeLiveFetcher(fetchImpl: typeof fetch = fetch, timeoutMs = LIVE_TIMEOUT_MS): FetchLive {
  return async () => {
    const res = await fetchImpl(LIVE_FORECAST_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`open-meteo forecast HTTP ${res.status}`);
    const body = await res.json() as { hourly?: { time?: string[]; precipitation?: (number | null)[] } };
    const times = body.hourly?.time, mm = body.hourly?.precipitation;
    if (!times || !mm || times.length !== mm.length) throw new Error("open-meteo forecast: unexpected response shape");
    const rows: RainHourRow[] = [];
    times.forEach((tm, i) => {
      const v = mm[i];
      if (v != null && Number.isFinite(v)) rows.push({ ts: new Date(`${tm}:00+08:00`).toISOString(), precipitation_mm: v });
    });
    return rows;
  };
}
