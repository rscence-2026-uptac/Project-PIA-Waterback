// Data-access port for the spec 06 functions. Logic modules depend on this interface only, so they are unit-tested
// with an in-memory fake (supabase/tests/functions/fakeStore.ts); spec06_supabase.ts is the real implementation.

export type DisruptionStatus = "predicted" | "confirmed" | "deployed" | "notified" | "resolved";
export type EventType = "predicted" | "confirmed" | "deployed" | "notified" | "resident_confirmed" | "resolved";

export interface DisruptionRow {
  id: string;
  status: DisruptionStatus;
  cause: "turbidity" | "drought" | "repair";
  started_at: string;
  resolved_at: string | null;
  window_start: string | null;
  window_end: string | null;
  likely_at: string | null;
  next_update_at: string | null;
}
export interface BarangayRow { barangay_id: string; name: string; wsp_name: string | null; service_level: string }
export interface SourceRow { id: string; name: string; barangay_id: string }
export interface ResidentRow {
  id: string; barangay_id: string; phone: string | null; display_name: string | null;
  preferred_language: "waray" | "filipino" | "english"; channel: "pwa" | "sms";
}
export interface NewEvent {
  disruption_id: string;
  event_type: EventType;
  actor: string;
  occurred_at: string;
  barangay_id: string | null;
  client_local_id?: string | null;
  payload_json: Record<string, unknown>;
}
export interface EventRow {
  disruption_id: string;
  event_type: EventType;
  actor: string;
  occurred_at: string;
  barangay_id: string | null;
  client_local_id?: string | null;
  payload_json: Record<string, unknown> | null;
}
export interface NewAllocation {
  disruption_id: string; barangay_id: string; priority_rank: number; officer_id: string; decided_at: string; note: string | null;
}
export interface NewReading {
  recorded_at: string; intake_id: string; turbidity_ntu: number; plant_status: string;
  reservoir_pct: number | null; clarifier_inflow_lps: number | null; treated_turbidity_ntu: number | null;
  source: "operator"; is_simulated: false; client_local_id: string;
}

export interface Store {
  getDisruption(id: string): Promise<DisruptionRow | null>;
  /** Latest not-yet-resolved disruption, or null. */
  getActiveDisruption(): Promise<DisruptionRow | null>;
  getBarangays(ids: string[]): Promise<BarangayRow[]>;
  getSource(id: string): Promise<SourceRow | null>;
  /** ranked_source_ids of the continuity chain for (disruption, barangay); null = no chain computed. */
  getChainSourceIds(disruptionId: string, barangayId: string): Promise<string[] | null>;
  insertAllocations(rows: NewAllocation[]): Promise<void>;
  /** One flag per input event, same order: false = skipped because client_local_id already exists. */
  insertEvents(events: NewEvent[]): Promise<boolean[]>;
  /** All events of a disruption, oldest first. */
  listEvents(disruptionId: string): Promise<EventRow[]>;
  /**
   * Sets status (and resolved_at when given) only if the current status is in `from`.
   * Returns whether a row changed. This is the guard that stops two racing requests both writing `resolved`.
   */
  setDisruptionStatus(id: string, to: DisruptionStatus, from: DisruptionStatus[], resolvedAt?: string): Promise<boolean>;
  /** Residents with channel 'sms' and a phone, in the given barangays (PII: service role only). */
  getSmsResidents(barangayIds: string[]): Promise<ResidentRow[]>;
  findResidentByPhone(e164: string): Promise<ResidentRow | null>;
  insertReading(row: NewReading): Promise<"inserted" | "duplicate">;
}

/** Order key for an event: server receive time when we wrote it, else occurred_at. */
export function eventOrderKey(e: { occurred_at: string; payload_json: Record<string, unknown> | null }): number {
  const r = e.payload_json?.recorded_at;
  return Date.parse(typeof r === "string" ? r : e.occurred_at);
}
