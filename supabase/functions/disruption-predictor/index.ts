// Spec 02: system-wide disruption predictor. Read-only (does not write disruptions; that is spec 03/06).
// Logic lives in ../_shared (pure TS, tested with vitest); this file is only the Deno + Supabase wrapper.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleRequest } from "../_shared/handler.ts";
import type { FetchData } from "../_shared/handler.ts";

const PAGE = 1000; // PostgREST default max rows per request

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// deno-lint-ignore no-explicit-any
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

const fetchData: FetchData = async (from, to) => {
  // `from` = as_of - 90 d (rain history). Readings are only needed for the last ~2 days (6-reading slope, 24 h staleness).
  const readingsFrom = new Date(Math.max(from.getTime(), to.getTime() - 2 * 24 * 3_600_000));
  const forecastTo = new Date(to.getTime() + 48 * 3_600_000);
  const [readings, rain, forecast] = await Promise.all([
    fetchAll((a, b) =>
      supabase.from("readings")
        .select("recorded_at,intake_id,turbidity_ntu,plant_status,reservoir_pct,clarifier_inflow_lps")
        .gt("recorded_at", readingsFrom.toISOString()).lte("recorded_at", to.toISOString())
        .order("recorded_at").order("id").range(a, b)),
    fetchAll((a, b) =>
      supabase.from("rainfall_hourly").select("ts,precipitation_mm")
        .gt("ts", from.toISOString()).lte("ts", to.toISOString())
        .order("ts").range(a, b)),
    fetchAll((a, b) =>
      supabase.from("rain_forecast_hourly").select("ts,precipitation_mm")
        .gt("ts", to.toISOString()).lte("ts", forecastTo.toISOString())
        .order("ts").range(a, b)),
  ]);
  // PostgREST returns numeric columns as numbers (or strings for huge values); normalise.
  return {
    readings: readings.map((r: any) => ({
      ...r,
      turbidity_ntu: Number(r.turbidity_ntu),
      reservoir_pct: r.reservoir_pct == null ? null : Number(r.reservoir_pct),
      clarifier_inflow_lps: r.clarifier_inflow_lps == null ? null : Number(r.clarifier_inflow_lps),
    })),
    rainHourly: rain.map((r: any) => ({ ts: r.ts, precipitation_mm: Number(r.precipitation_mm) })),
    forecastHourly: forecast.map((r: any) => ({ ts: r.ts, precipitation_mm: Number(r.precipitation_mm) })),
  };
};

Deno.serve((req) => handleRequest(req, fetchData));
