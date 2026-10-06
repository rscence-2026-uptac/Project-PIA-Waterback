// Anon REST reads (RLS select policies allow anon on these tables). No writes from here.
import { z } from "zod";
import { SourceType } from "../contracts/spec04";
import { requireClient } from "./client";

const num = z.coerce.number(); // PostgREST returns numeric columns as numbers, but be tolerant of strings

export const SourceRow = z.object({
  id: z.string(),
  barangay_id: z.string(),
  name: z.string(),
  type: SourceType,
  safety_score: num,
  travel_minutes: num,
  cost_php_per_unit: num,
  active: z.boolean(),
  provenance: z.enum(["wsp", "osm", "web", "placeholder"]).nullable().optional(),
  is_simulated: z.boolean().nullable().optional(),
  source_ref: z.string().nullable().optional(),
  lat: num.nullable().optional(),
  lng: num.nullable().optional(),
});
export type SourceRow = z.infer<typeof SourceRow>;

// network_dependent is deliberately not selected: migration 20261006000010 may not be applied yet.
const SOURCE_COLUMNS = "id,barangay_id,name,type,safety_score,travel_minutes,cost_php_per_unit,active,provenance,is_simulated,source_ref,lat,lng";

/** All sources of one barangay (active or not; the caller filters). */
export async function fetchSources(barangayId: string): Promise<SourceRow[]> {
  const { data, error } = await requireClient().from("sources").select(SOURCE_COLUMNS).eq("barangay_id", barangayId);
  if (error) throw new Error(`sources: ${error.message}`);
  return z.array(SourceRow).parse(data ?? []);
}

export const ReadingRow = z.object({
  id: z.string(),
  recorded_at: z.string(),
  intake_id: z.string(),
  turbidity_ntu: num,
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: num.nullable(),
  clarifier_inflow_lps: num.nullable(),
  treated_turbidity_ntu: num.nullable().optional(),
  is_simulated: z.boolean().nullable().optional(),
});
export type ReadingRow = z.infer<typeof ReadingRow>;

/** Readings of one intake in [from, to], oldest first. */
export async function fetchReadings(intakeId: string, from: Date, to: Date): Promise<ReadingRow[]> {
  const { data, error } = await requireClient().from("readings").select("*")
    .eq("intake_id", intakeId)
    .gte("recorded_at", from.toISOString()).lte("recorded_at", to.toISOString())
    .order("recorded_at", { ascending: true }).limit(1000);
  if (error) throw new Error(`readings: ${error.message}`);
  return z.array(ReadingRow).parse(data ?? []);
}

/** The newest reading of an intake at or before `to`, or null. */
export async function fetchLatestReading(intakeId: string, to: Date): Promise<ReadingRow | null> {
  const { data, error } = await requireClient().from("readings").select("*")
    .eq("intake_id", intakeId).lte("recorded_at", to.toISOString())
    .order("recorded_at", { ascending: false }).limit(1);
  if (error) throw new Error(`readings: ${error.message}`);
  return z.array(ReadingRow).parse(data ?? [])[0] ?? null;
}

export const RainRow = z.object({ ts: z.string(), precipitation_mm: num });
export type RainRow = z.infer<typeof RainRow>;

/** Observed hourly rain in [from, to], oldest first. */
export async function fetchRain(from: Date, to: Date): Promise<RainRow[]> {
  const { data, error } = await requireClient().from("rainfall_hourly").select("ts,precipitation_mm")
    .gte("ts", from.toISOString()).lte("ts", to.toISOString()).order("ts", { ascending: true }).limit(1000);
  if (error) throw new Error(`rainfall_hourly: ${error.message}`);
  return z.array(RainRow).parse(data ?? []);
}

// ---------- Event record (/lgu/event): disruptions, event_log, allocations, continuity_chains, sms_outbox ----------

export const DisruptionRow = z.object({
  id: z.string(),
  started_at: z.string(),
  resolved_at: z.string().nullable().optional(),
  cause: z.enum(["turbidity", "drought", "repair"]),
  signal_level: z.coerce.number(),
  status: z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]),
  window_start: z.string().nullable().optional(),
  window_end: z.string().nullable().optional(),
  likely_at: z.string().nullable().optional(),
  heads_up_from: z.string().nullable().optional(),
});
export type DisruptionRow = z.infer<typeof DisruptionRow>;

/** The open disruption (newest not resolved), else the most recent one, else null. */
export async function fetchEventDisruption(): Promise<DisruptionRow | null> {
  const { data, error } = await requireClient().from("disruptions").select("*")
    .order("started_at", { ascending: false }).limit(10);
  if (error) throw new Error(`disruptions: ${error.message}`);
  const rows = z.array(DisruptionRow).parse(data ?? []);
  return rows.find((r) => r.status !== "resolved") ?? rows[0] ?? null;
}

export const EventLogRow = z.object({
  id: z.string(),
  disruption_id: z.string(),
  event_type: z.enum(["predicted", "confirmed", "deployed", "notified", "resident_confirmed", "resolved"]),
  actor: z.string(),
  occurred_at: z.string(),
  barangay_id: z.string().nullable().optional(),
  payload_json: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type EventLogRow = z.infer<typeof EventLogRow>;

export async function fetchEventLog(disruptionId: string): Promise<EventLogRow[]> {
  const { data, error } = await requireClient().from("event_log").select("*")
    .eq("disruption_id", disruptionId).order("occurred_at", { ascending: true }).limit(2000);
  if (error) throw new Error(`event_log: ${error.message}`);
  return z.array(EventLogRow).parse(data ?? []);
}

export const AllocationRow = z.object({
  id: z.string(),
  disruption_id: z.string(),
  barangay_id: z.string(),
  priority_rank: z.coerce.number(),
  officer_id: z.string(),
  decided_at: z.string(),
  note: z.string().nullable().optional(),
});
export type AllocationRow = z.infer<typeof AllocationRow>;

export async function fetchAllocations(disruptionId: string): Promise<AllocationRow[]> {
  const { data, error } = await requireClient().from("allocations").select("*")
    .eq("disruption_id", disruptionId).order("priority_rank", { ascending: true }).limit(500);
  if (error) throw new Error(`allocations: ${error.message}`);
  return z.array(AllocationRow).parse(data ?? []);
}

/** First stop of each barangay's continuity chain: barangay_id -> source (name, type). Empty when no chains exist. */
export async function fetchFirstStops(disruptionId: string): Promise<Map<string, { name: string; type: string }>> {
  const { data, error } = await requireClient().from("continuity_chains").select("barangay_id,ranked_source_ids")
    .eq("disruption_id", disruptionId).limit(500);
  if (error) throw new Error(`continuity_chains: ${error.message}`);
  const chains = z.array(z.object({ barangay_id: z.string(), ranked_source_ids: z.array(z.string()) })).parse(data ?? []);
  const firstIds = [...new Set(chains.map((c) => c.ranked_source_ids[0]).filter((id): id is string => !!id))];
  const out = new Map<string, { name: string; type: string }>();
  if (firstIds.length === 0) return out;
  const res = await requireClient().from("sources").select("id,name,type").in("id", firstIds);
  if (res.error) throw new Error(`sources: ${res.error.message}`);
  const byId = new Map(z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })).parse(res.data ?? []).map((s) => [s.id, s]));
  for (const c of chains) {
    const s = byId.get(c.ranked_source_ids[0] ?? "");
    if (s) out.set(c.barangay_id, { name: s.name, type: s.type });
  }
  return out;
}

export const SmsRow = z.object({
  barangay_id: z.string().nullable(),
  template: z.string().nullable(),
  direction: z.enum(["outbound", "inbound"]),
  mode: z.enum(["dry_run", "live"]),
});
export type SmsRow = z.infer<typeof SmsRow>;

/** sms_outbox rows of a disruption (masked numbers only; the table has no full phone numbers). Throws when the table is missing. */
export async function fetchSmsRows(disruptionId: string): Promise<SmsRow[]> {
  const { data, error } = await requireClient().from("sms_outbox").select("barangay_id,template,direction,mode")
    .eq("disruption_id", disruptionId).limit(5000);
  if (error) throw new Error(`sms_outbox: ${error.message}`);
  return z.array(SmsRow).parse(data ?? []);
}

/** Outbound SMS logged for one barangay (all disruptions when `disruptionId` is null). Null when the table is unavailable. */
export async function fetchSmsCount(barangayId: string, disruptionId: string | null): Promise<number | null> {
  let q = requireClient().from("sms_outbox").select("id", { count: "exact", head: true })
    .eq("barangay_id", barangayId).eq("direction", "outbound");
  if (disruptionId) q = q.eq("disruption_id", disruptionId);
  const { count, error } = await q;
  return error ? null : count ?? 0;
}

/** Critical facilities per barangay (health_station | school | evacuation_center), straight from `barangays`. */
export async function fetchFacilities(barangayIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (barangayIds.length === 0) return out;
  const { data, error } = await requireClient().from("barangays").select("barangay_id,critical_facilities").in("barangay_id", barangayIds);
  if (error) throw new Error(`barangays: ${error.message}`);
  for (const row of z.array(z.object({ barangay_id: z.string(), critical_facilities: z.array(z.string()).nullable() })).parse(data ?? [])) {
    out.set(row.barangay_id, row.critical_facilities ?? []);
  }
  return out;
}
