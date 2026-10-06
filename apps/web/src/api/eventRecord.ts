// /lgu/event in live mode: the open (or most recent) disruption, its event_log, allocations, first stops and SMS counts,
// all from the anon REST reads. Refreshes when an event_log row is inserted (Realtime).
import { useEffect } from "react";
import { BARANGAYS } from "../data/mock";
import { getClient, isLive } from "./client";
import {
  fetchAllocations, fetchEventDisruption, fetchEventLog, fetchFirstStops, fetchSmsRows,
  type AllocationRow, type DisruptionRow, type EventLogRow, type SmsRow,
} from "./rest";
import { useResource, type Resource } from "./useResource";

export const barangayName = (id: string | null | undefined) =>
  id ? BARANGAYS.find((b) => b.barangay_id === id)?.name ?? id : null;

export const eventCodeOf = (id: string) => `EVT-${id.slice(0, 8).toUpperCase()}`;

/** The seven stages of the record, in order. `heads_up` is a per-barangay `predicted` event with payload.kind = "heads_up". */
export const STAGES = ["predicted", "heads_up", "confirmed", "deployed", "notified", "resident_confirmed", "resolved"] as const;
export type Stage = (typeof STAGES)[number];

export function stageOf(e: Pick<EventLogRow, "event_type" | "barangay_id" | "payload_json">): Stage {
  if (e.event_type === "predicted" && e.barangay_id && e.payload_json?.kind === "heads_up") return "heads_up";
  return e.event_type;
}

/** A deployed event is either the allocation step or the deployed-source step (payload.step). */
const rank = (e: EventLogRow) => STAGES.indexOf(stageOf(e)) * 10 + (e.payload_json?.step === "source" ? 1 : 0);

export interface TimelineEvent extends EventLogRow {
  stage: Stage;
}

export interface SmsSummary {
  outbound: number;
  inbound: number;
  dry_run: number;
  live: number;
  byTemplate: [string, number][];
}

export interface EventRecord {
  disruption: DisruptionRow;
  events: TimelineEvent[];
  allocations: AllocationRow[];
  firstStops: Map<string, { name: string; type: string }>;
  /** null when sms_outbox is not on this project (migration not applied); smsError says why. */
  sms: SmsSummary | null;
  smsError: string | null;
  /** barangay -> outbound SMS count, when the log is available. */
  smsByBarangay: Map<string, number>;
}

export function summariseSms(rows: SmsRow[]): { summary: SmsSummary; byBarangay: Map<string, number> } {
  const templates = new Map<string, number>();
  const byBarangay = new Map<string, number>();
  let outbound = 0, inbound = 0, dry_run = 0, live = 0;
  for (const r of rows) {
    if (r.direction === "inbound") { inbound++; continue; }
    outbound++;
    if (r.mode === "dry_run") dry_run++; else live++;
    templates.set(r.template ?? "?", (templates.get(r.template ?? "?") ?? 0) + 1);
    if (r.barangay_id) byBarangay.set(r.barangay_id, (byBarangay.get(r.barangay_id) ?? 0) + 1);
  }
  return { summary: { outbound, inbound, dry_run, live, byTemplate: [...templates].sort((a, b) => b[1] - a[1]) }, byBarangay };
}

export async function loadEventRecord(): Promise<EventRecord | null> {
  const disruption = await fetchEventDisruption();
  if (!disruption) return null;
  const [log, allocations, firstStops, smsRes] = await Promise.all([
    fetchEventLog(disruption.id),
    fetchAllocations(disruption.id),
    fetchFirstStops(disruption.id).catch(() => new Map<string, { name: string; type: string }>()),
    fetchSmsRows(disruption.id).then((rows) => ({ rows, error: null as string | null }), (e: unknown) => ({ rows: null, error: e instanceof Error ? e.message : String(e) })),
  ]);
  const events: TimelineEvent[] = log
    .map((e) => ({ ...e, stage: stageOf(e) }))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || rank(a) - rank(b));
  const sms = smsRes.rows ? summariseSms(smsRes.rows) : null;
  return {
    disruption, events, allocations, firstStops,
    sms: sms?.summary ?? null, smsError: smsRes.error, smsByBarangay: sms?.byBarangay ?? new Map(),
  };
}

export function useEventRecord(): Resource<EventRecord | null> {
  const res = useResource(() => loadEventRecord(), [], isLive());
  const { reload } = res;
  useEffect(() => {
    const client = getClient();
    if (!client) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = client
      .channel(`event-record-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_log" }, () => {
        clearTimeout(timer);
        timer = setTimeout(reload, 400); // a confirm-allocation writes many rows at once
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [reload]);
  return res;
}
