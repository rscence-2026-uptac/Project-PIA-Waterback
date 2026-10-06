// Supabase-backed data access for the spec 03 / 07 functions. Typed against a minimal client shape so vitest can pass a fake.
// deno-lint-ignore-file no-explicit-any
import type { FetchData } from "./handler.ts";
import type { BarangayRow } from "./affected.ts";
import type { DisruptionRow, DisruptionStore, EventInsert } from "./disruption_monitor.ts";
import type { EventRow } from "./dashboard_snapshot.ts";

export type SupabaseLike = { from(table: string): any };
const PAGE = 1000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** Same queries as disruption-predictor/index.ts (kept separate so that folder stays untouched). */
export const makeFetchData = (supabase: SupabaseLike): FetchData => async (from, to) => {
  const readingsFrom = new Date(Math.max(from.getTime(), to.getTime() - 2 * 24 * 3_600_000));
  const forecastTo = new Date(to.getTime() + 48 * 3_600_000);
  const [readings, rain, forecast] = await Promise.all([
    fetchAll((a, b) => supabase.from("readings")
      .select("recorded_at,intake_id,turbidity_ntu,plant_status,reservoir_pct,clarifier_inflow_lps")
      .gt("recorded_at", readingsFrom.toISOString()).lte("recorded_at", to.toISOString())
      .order("recorded_at").order("id").range(a, b)),
    fetchAll((a, b) => supabase.from("rainfall_hourly").select("ts,precipitation_mm")
      .gt("ts", from.toISOString()).lte("ts", to.toISOString()).order("ts").range(a, b)),
    fetchAll((a, b) => supabase.from("rain_forecast_hourly").select("ts,precipitation_mm")
      .gt("ts", to.toISOString()).lte("ts", forecastTo.toISOString()).order("ts").range(a, b)),
  ]);
  const num = (v: any) => (v == null ? null : Number(v));
  return {
    readings: readings.map((r: any) => ({ ...r, turbidity_ntu: Number(r.turbidity_ntu), reservoir_pct: num(r.reservoir_pct), clarifier_inflow_lps: num(r.clarifier_inflow_lps) })),
    rainHourly: rain.map((r: any) => ({ ts: r.ts, precipitation_mm: Number(r.precipitation_mm) })),
    forecastHourly: forecast.map((r: any) => ({ ts: r.ts, precipitation_mm: Number(r.precipitation_mm) })),
  };
};

export async function fetchBarangays(supabase: SupabaseLike): Promise<BarangayRow[]> {
  const rows = await fetchAll<any>((a, b) => supabase.from("barangays")
    .select("barangay_id,zone,service_level,piped_households,unpiped_households,coverage_source,critical_facilities")
    .order("barangay_id").range(a, b));
  return rows.map((r) => ({ ...r, critical_facilities: r.critical_facilities ?? [] }));
}

const DISRUPTION_COLS = "id,started_at,resolved_at,cause,p_turbidity,p_drought,signal_level,status,window_start,window_end,likely_at,next_update_at,heads_up_from";
const norm = (r: any): DisruptionRow => ({ ...r, p_turbidity: r.p_turbidity == null ? null : Number(r.p_turbidity), p_drought: r.p_drought == null ? null : Number(r.p_drought) });

export function makeDisruptionStore(supabase: SupabaseLike): DisruptionStore {
  const one = async (q: PromiseLike<{ data: any; error: any }>) => {
    const { data, error } = await q;
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data ? norm(data) : null;
  };
  return {
    findOpen: () => one(supabase.from("disruptions").select(DISRUPTION_COLS).neq("status", "resolved")
      .order("started_at", { ascending: false }).limit(1).maybeSingle()),
    getById: (id) => one(supabase.from("disruptions").select(DISRUPTION_COLS).eq("id", id).maybeSingle()),
    insert: async (row) => (await one(supabase.from("disruptions").insert(row).select(DISRUPTION_COLS).single()))!,
    update: async (id, patch) => (await one(supabase.from("disruptions").update(patch).eq("id", id).select(DISRUPTION_COLS).single()))!,
    hasEvent: async (id, type) => {
      const { data, error } = await supabase.from("event_log").select("id").eq("disruption_id", id).eq("event_type", type).limit(1);
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    logEvent: async (e: EventInsert) => {
      const { error } = await supabase.from("event_log").insert(e);
      if (error) throw new Error(error.message);
    },
  };
}

export async function fetchEvents(supabase: SupabaseLike, disruptionId: string): Promise<EventRow[]> {
  return await fetchAll<EventRow>((a, b) => supabase.from("event_log")
    .select("id,event_type,barangay_id,occurred_at,payload_json")
    .eq("disruption_id", disruptionId).order("occurred_at").order("id").range(a, b));
}

export async function fetchServed(supabase: SupabaseLike): Promise<{ barangay_id: string; service_level: "level_iii" | "level_i" }[]> {
  return await fetchAll<any>((a, b) => supabase.from("barangays").select("barangay_id,service_level")
    .neq("service_level", "unserved").order("barangay_id").range(a, b));
}
