// Supabase implementation of the Store port (service role; the functions are the only writers, RLS has no write policies).
// Kept deliberately thin: all rules live in the pure modules. The client type is loose on purpose so this file
// does not need npm types and stays importable by the vitest suite.
import { HttpError } from "./spec06_http.ts";
import type {
  BarangayRow, DisruptionRow, EventRow, NewAllocation, NewEvent, NewReading, ResidentRow, SourceRow, Store,
} from "./spec06_store.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;

function check<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export function supabaseStore(sb: Sb): Store {
  const DIS = "id,status,cause,started_at,resolved_at,window_start,window_end,likely_at,next_update_at";
  return {
    async getDisruption(id) {
      return check(await sb.from("disruptions").select(DIS).eq("id", id).maybeSingle()) as DisruptionRow | null;
    },
    async getActiveDisruption() {
      const rows = check(await sb.from("disruptions").select(DIS).neq("status", "resolved").order("started_at", { ascending: false }).limit(1));
      return (rows as DisruptionRow[])[0] ?? null;
    },
    async getBarangays(ids) {
      if (!ids.length) return [];
      return check(await sb.from("barangays").select("barangay_id,name,wsp_name,service_level").in("barangay_id", ids)) as BarangayRow[];
    },
    async getSource(id) {
      return check(await sb.from("sources").select("id,name,barangay_id").eq("id", id).maybeSingle()) as SourceRow | null;
    },
    async getChainSourceIds(disruptionId, barangayId) {
      const rows = check(await sb.from("continuity_chains").select("ranked_source_ids")
        .eq("disruption_id", disruptionId).eq("barangay_id", barangayId).order("computed_at", { ascending: false }).limit(1));
      const r = (rows as { ranked_source_ids: string[] }[])[0];
      return r ? r.ranked_source_ids : null;
    },
    async insertAllocations(rows: NewAllocation[]) {
      check(await sb.from("allocations").insert(rows));
    },
    async insertEvents(events: NewEvent[]) {
      const flags: boolean[] = new Array(events.length).fill(true);
      const unkeyed = events.map((e, i) => ({ e, i })).filter((x) => !x.e.client_local_id);
      const keyed = events.map((e, i) => ({ e, i })).filter((x) => x.e.client_local_id);
      if (unkeyed.length) check(await sb.from("event_log").insert(unkeyed.map((x) => ({ ...x.e, client_local_id: null }))));
      // ignoreDuplicates -> ON CONFLICT DO NOTHING; the returned rows tell us whether this call inserted it.
      await Promise.all(keyed.map(async ({ e, i }) => {
        const rows = check(await sb.from("event_log").upsert(e, { onConflict: "client_local_id", ignoreDuplicates: true }).select("id"));
        flags[i] = Array.isArray(rows) && rows.length > 0;
      }));
      return flags;
    },
    async listEvents(disruptionId) {
      const rows = check(await sb.from("event_log")
        .select("disruption_id,event_type,actor,occurred_at,barangay_id,client_local_id,payload_json")
        .eq("disruption_id", disruptionId).order("occurred_at", { ascending: true }));
      return rows as EventRow[];
    },
    async setDisruptionStatus(id, to, from, resolvedAt) {
      const patch: Record<string, unknown> = { status: to };
      if (resolvedAt) patch.resolved_at = resolvedAt;
      const rows = check(await sb.from("disruptions").update(patch).eq("id", id).in("status", from).select("id"));
      return Array.isArray(rows) && rows.length > 0;
    },
    async getSmsResidents(barangayIds) {
      return check(await sb.from("residents").select("id,barangay_id,phone,display_name,preferred_language,channel")
        .in("barangay_id", barangayIds).eq("channel", "sms").not("phone", "is", null)) as ResidentRow[];
    },
    async findResidentByPhone(e164) {
      const rows = check(await sb.from("residents").select("id,barangay_id,phone,display_name,preferred_language,channel")
        .eq("phone", e164).order("created_at", { ascending: false }).limit(1));
      return (rows as ResidentRow[])[0] ?? null;
    },
    async insertReading(row: NewReading) {
      const r = await sb.from("readings").upsert(row, { onConflict: "client_local_id", ignoreDuplicates: true }).select("id");
      if (r.error) {
        if (r.error.code === "23503") throw new HttpError(422, "unknown_intake", "unknown intake_id");
        throw new Error(r.error.message);
      }
      return Array.isArray(r.data) && r.data.length > 0 ? "inserted" : "duplicate";
    },
  };
}
