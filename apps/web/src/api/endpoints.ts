// One typed function per Edge Function (supabase/functions/README.md). Reads take the demo clock's
// `asOf`; responses are validated with the app's zod contracts and tolerate the optional extras.
import { z } from "zod";
import { AffectedArea } from "../contracts/spec03";
import { RankedChain, RankedChainBatch } from "../contracts/spec04";
import { OfflineQueueItem } from "../contracts/spec05";
import { AllocationDecision, DeployResponse, NotificationPayload } from "../contracts/spec06";
import { DashboardSnapshot, DisruptionInfo } from "../contracts/spec07";
import { PredictorOutput } from "../contracts/predictor";
import { asOfParam, callFn } from "./http";

// ---------- Reads ----------

/** Spec 02. GET disruption-predictor?as_of= */
export const getPredictor = (asOf: Date, signal?: AbortSignal) =>
  callFn("disruption-predictor", { query: { as_of: asOfParam(asOf) }, schema: PredictorOutput, signal });

/** Spec 03. One row per barangay (57). `disruptionId` pins a disruption; default is the newest open one. */
export const getAffectedAreas = (asOf: Date, opts: { disruptionId?: string; minSignal?: number; signal?: AbortSignal } = {}) =>
  callFn("affected-areas", {
    query: { as_of: asOfParam(asOf), disruption_id: opts.disruptionId, min_signal: opts.minSignal },
    schema: z.array(AffectedArea),
    signal: opts.signal,
  });

/**
 * Spec 07. as_of reads the plant status and cuts events at the demo clock; live_events=1 keeps events written after it
 * (allocation / notify / confirmation events are stamped at real time, so a replayed clock must not hide them).
 */
export const getDashboardSnapshot = (asOf: Date, signal?: AbortSignal) =>
  callFn("dashboard-snapshot", { query: { as_of: asOfParam(asOf), live_events: 1 }, schema: DashboardSnapshot, signal });

// ---------- Spec 04 ----------

/** POST rank-chain, one barangay. Upserts continuity_chains (a write); call it only when a disruption exists. */
export const postRankChain = (barangayId: string, disruptionId: string, signal?: AbortSignal) =>
  callFn("rank-chain", { method: "POST", body: { barangay_id: barangayId, disruption_id: disruptionId }, schema: RankedChain, signal });

/** POST rank-chain, batch (all affected barangays when `barangayIds` is omitted). */
export const postRankChainBatch = (disruptionId: string, barangayIds?: string[], signal?: AbortSignal) =>
  callFn("rank-chain", {
    method: "POST",
    body: { disruption_id: disruptionId, ...(barangayIds ? { barangay_ids: barangayIds } : {}) },
    schema: RankedChainBatch,
    signal,
  });

// ---------- disruption-monitor (writes) ----------

const MonitorResult = z.object({
  action: z.enum(["created", "updated", "unchanged", "none", "confirmed", "heads_up"]),
  disruption: DisruptionInfo.partial().extend({ id: z.string() }).nullable().optional(),
  prediction: PredictorOutput.optional(),
  heads_up: z.object({
    barangays: z.number().nullable().optional(),
    level: z.number().nullable().optional(),
    mode: z.string().nullable().optional(),
    skipped: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
  }).nullable().optional(),
});
export type MonitorResult = z.infer<typeof MonitorResult>;

/** Runs the predictor and creates / updates the disruption AT `asOf`; sends the automatic heads-up. */
export const runMonitor = (asOf: Date) =>
  callFn("disruption-monitor", { method: "POST", body: { as_of: asOfParam(asOf) }, schema: MonitorResult });

/** predicted -> confirmed (operator confirms). */
export const confirmDisruption = (disruptionId: string, actor = "operator") =>
  callFn("disruption-monitor", { method: "POST", body: { action: "confirm", disruption_id: disruptionId, actor }, schema: MonitorResult });

// ---------- Spec 06 (writes) ----------

const Loose = z.looseObject({});

export const postConfirmAllocation = (decisions: AllocationDecision[]) =>
  callFn("confirm-allocation", { method: "POST", body: decisions, schema: Loose });

export const postDeployResponse = (response: DeployResponse) =>
  callFn("deploy-response", { method: "POST", body: response, schema: Loose });

export const postNotifyResidents = (payloads: NotificationPayload[]) =>
  callFn("notify-residents", { method: "POST", body: payloads, schema: Loose });

export const postResidentConfirmation = (body: unknown) =>
  callFn("resident-confirmation", { method: "POST", body, schema: Loose });

// ---------- Offline queue ----------

const SyncResult = z.object({
  local_id: z.string(),
  kind: z.string().optional(),
  status: z.enum(["synced", "already_synced", "rejected", "failed"]),
  code: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});
export type SyncResult = z.infer<typeof SyncResult>;

/** POST sync-queue. Items are applied in queued_at order; local_id is the idempotency key. */
export const postSyncQueue = (items: OfflineQueueItem[]) =>
  callFn("sync-queue", {
    method: "POST",
    body: items.map(({ local_id, kind, payload, queued_at }) => ({ local_id, kind, payload, queued_at, synced: false })),
    schema: z.object({ results: z.array(SyncResult) }).loose(),
  });
