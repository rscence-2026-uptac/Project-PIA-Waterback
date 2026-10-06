// Disruption lifecycle (Integration 2 "detected" step): predictor -> disruptions row + event_log, no manual DB edits.
import type { FetchData } from "./handler.ts";
import type { FetchLive } from "./forecast.ts";
import { makeLiveFetcher } from "./forecast.ts";
import { json, parseAsOf, preflight, UUID_RE } from "./http.ts";
import type { PredictorOutput } from "./predict.ts";
import { runPredictor } from "./predictor_runner.ts";
import { causeOf } from "./affected.ts";
import { sendHeadsUp } from "./heads_up.ts";
import type { HeadsUpDeps, HeadsUpResult } from "./heads_up.ts";

export type DisruptionStatus = "predicted" | "confirmed" | "deployed" | "notified" | "resolved";
export interface DisruptionRow {
  id: string;
  started_at: string;
  resolved_at: string | null;
  cause: "turbidity" | "drought" | "repair";
  p_turbidity: number | null;
  p_drought: number | null;
  signal_level: number;
  status: DisruptionStatus;
  window_start: string | null;
  window_end: string | null;
  likely_at: string | null;
  next_update_at: string | null;
  heads_up_from: string | null;
}
export type DisruptionInsert = Omit<DisruptionRow, "id" | "resolved_at">;
export interface EventInsert {
  disruption_id: string;
  event_type: "predicted" | "confirmed";
  actor: string;
  occurred_at: string;
  barangay_id: null; // system-wide
  payload_json: Record<string, unknown>;
}
export interface DisruptionStore {
  /** Newest disruption whose status is not 'resolved'. */
  findOpen(): Promise<DisruptionRow | null>;
  getById(id: string): Promise<DisruptionRow | null>;
  insert(row: DisruptionInsert): Promise<DisruptionRow>;
  update(id: string, patch: Partial<DisruptionRow>): Promise<DisruptionRow>;
  hasEvent(id: string, type: EventInsert["event_type"]): Promise<boolean>;
  logEvent(e: EventInsert): Promise<void>;
}

/** Open a disruption once the system signal reaches this level (spec 03: "signal >= 2"). */
export const OPEN_AT_SIGNAL = 2;
/** HEURISTIC horizons (not from the WSP): how far ahead each model looks. Used only to place the display window. */
export const HORIZON_MS = { turbidity: 48 * 3_600_000, drought: 7 * 24 * 3_600_000 } as const;
/** HEURISTIC: predictor re-run cadence shown as "next update by". */
export const NEXT_UPDATE_MS = 2 * 3_600_000;

const iso = (ms: number) => new Date(ms).toISOString();

/** Window heuristic: window_start = as_of + H/4, likely_at = as_of + H/2, window_end = as_of + H (H = model horizon). */
export function planWindow(cause: "turbidity" | "drought", asOf: Date) {
  const h = HORIZON_MS[cause], t = asOf.getTime();
  return { window_start: iso(t + h / 4), likely_at: iso(t + h / 2), window_end: iso(t + h) };
}

export function newDisruptionRow(p: PredictorOutput, asOf: Date): DisruptionInsert {
  const cause = causeOf(p);
  return {
    cause, started_at: asOf.toISOString(),
    p_turbidity: p.p_turbidity, p_drought: p.p_drought, signal_level: p.signal_level, status: "predicted",
    ...planWindow(cause, asOf),
    next_update_at: iso(asOf.getTime() + NEXT_UPDATE_MS),
    heads_up_from: p.signal_level <= 2 ? asOf.toISOString() : null, // signal 1-2 = heads-up phase
  };
}

const predictedEvent = (d: DisruptionRow, p: PredictorOutput, asOf: Date): EventInsert => ({
  disruption_id: d.id, event_type: "predicted", actor: "system", occurred_at: asOf.toISOString(), barangay_id: null,
  payload_json: { signal_level: p.signal_level, p_turbidity: p.p_turbidity, p_drought: p.p_drought, cause: d.cause, as_of: asOf.toISOString(), fallback_used: p.fallback_used, forecast_source: p.forecast_source },
});

export type MonitorAction = "created" | "updated" | "unchanged" | "none";

/** Run one monitor tick for an already-computed prediction. Idempotent for the same as_of. */
export async function monitorTick(store: DisruptionStore, p: PredictorOutput, asOf: Date): Promise<{ action: MonitorAction; disruption: DisruptionRow | null }> {
  const open = await store.findOpen();
  if (!open) {
    if (p.signal_level < OPEN_AT_SIGNAL) return { action: "none", disruption: null };
    let created: DisruptionRow;
    try { created = await store.insert(newDisruptionRow(p, asOf)); }
    catch (e) {
      // Lost a race with a concurrent tick: adopt the row that won instead of creating a duplicate.
      const winner = await store.findOpen();
      if (!winner) throw e;
      return { action: "unchanged", disruption: winner };
    }
    await store.logEvent(predictedEvent(created, p, asOf));
    return { action: "created", disruption: created };
  }
  // Repair a half-finished create (row written, event lost).
  if (!(await store.hasEvent(open.id, "predicted"))) await store.logEvent(predictedEvent(open, p, asOf));
  const next = iso(asOf.getTime() + NEXT_UPDATE_MS);
  const patch: Partial<DisruptionRow> = {};
  if (open.p_turbidity !== p.p_turbidity) patch.p_turbidity = p.p_turbidity;
  if (open.p_drought !== p.p_drought) patch.p_drought = p.p_drought;
  if (open.signal_level !== p.signal_level) patch.signal_level = p.signal_level;
  if (open.next_update_at == null || Date.parse(open.next_update_at) !== Date.parse(next)) patch.next_update_at = next;
  if (Object.keys(patch).length === 0) return { action: "unchanged", disruption: open };
  return { action: "updated", disruption: await store.update(open.id, patch) };
}

/** Operator/LGU confirms the predicted risk is real: predicted -> confirmed (+ system-wide 'confirmed' event). */
export async function confirmDisruption(store: DisruptionStore, id: string, actor: string, at: Date):
  Promise<{ status: 200 | 404 | 409; action?: "confirmed" | "unchanged"; disruption?: DisruptionRow; error?: string }> {
  const d = await store.getById(id);
  if (!d) return { status: 404, error: "disruption not found" };
  if (d.status === "resolved") return { status: 409, error: "disruption already resolved" };
  if (d.status !== "predicted") return { status: 200, action: "unchanged", disruption: d }; // already confirmed or further along
  const updated = await store.update(id, { status: "confirmed" });
  await store.logEvent({ disruption_id: id, event_type: "confirmed", actor, occurred_at: at.toISOString(), barangay_id: null, payload_json: { signal_level: d.signal_level, cause: d.cause } });
  return { status: 200, action: "confirmed", disruption: updated };
}

export interface MonitorDeps {
  fetchData: FetchData;
  store: DisruptionStore;
  now?: () => Date;
  fetchLive?: FetchLive;
  /** Automatic heads-up (SMS dry-run by default + per-barangay PWA events). Omitted = heads-up disabled (response `heads_up: null`). */
  headsUp?: HeadsUpDeps;
}

const noHeadsUp = (deps: HeadsUpDeps, skipped: string): HeadsUpResult =>
  ({ disruption_id: null, level: null, barangays: 0, sms_planned: 0, sms_skipped_demo: 0, mode: deps.sms.live ? "live" : "dry_run", skipped });

/** Never lets a heads-up failure fail the tick (the disruption row and its event are already written). */
async function tryHeadsUp(deps: HeadsUpDeps, d: DisruptionRow | null, asOf: Date): Promise<HeadsUpResult> {
  if (!d) return noHeadsUp(deps, "no open disruption");
  try { return await sendHeadsUp(deps, d, asOf); }
  catch (e) {
    console.error("heads-up failed", e);
    return { ...noHeadsUp(deps, "heads-up failed"), disruption_id: d.id, level: d.signal_level, error: "heads-up failed" };
  }
}

export async function handleMonitor(req: Request, deps: MonitorDeps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const now = (deps.now ?? (() => new Date()))();
  let body: Record<string, unknown>;
  try { body = ((await req.json()) ?? {}) as Record<string, unknown>; }
  catch { return json(400, { error: "invalid JSON body" }); }
  if (typeof body !== "object" || Array.isArray(body)) return json(400, { error: "body must be a JSON object" });

  try {
    if (body.action === "confirm") {
      if (typeof body.disruption_id !== "string" || !UUID_RE.test(body.disruption_id)) return json(400, { error: "disruption_id (uuid) is required for action 'confirm'" });
      const actor = typeof body.actor === "string" && body.actor ? body.actor : "operator";
      const r = await confirmDisruption(deps.store, body.disruption_id, actor, now);
      return r.error ? json(r.status, { error: r.error }) : json(200, { action: r.action, disruption: r.disruption });
    }
    if (body.action === "heads_up") {
      if (typeof body.disruption_id !== "string" || !UUID_RE.test(body.disruption_id)) return json(400, { error: "disruption_id (uuid) is required for action 'heads_up'" });
      if (!deps.headsUp) return json(501, { error: "heads-up is not configured" });
      const d = await deps.store.getById(body.disruption_id);
      if (!d) return json(404, { error: "disruption not found" });
      if (d.status === "resolved") return json(409, { error: "disruption already resolved" });
      const at = parseAsOf(body.as_of, now);
      if (!at.ok) return json(400, { error: at.error });
      return json(200, { action: "heads_up", disruption: d, heads_up: await tryHeadsUp(deps.headsUp, d, at.asOf) });
    }
    if (body.action != null && body.action !== "run") return json(400, { error: "action must be 'run' (default), 'confirm' or 'heads_up'" });
    const a = parseAsOf(body.as_of, now);
    if (!a.ok) return json(400, { error: a.error });
    const prediction = await runPredictor(deps.fetchData, a.asOf, now, deps.fetchLive ?? makeLiveFetcher());
    const r = await monitorTick(deps.store, prediction, a.asOf);
    const heads_up = deps.headsUp ? await tryHeadsUp(deps.headsUp, r.disruption, a.asOf) : null;
    return json(200, { action: r.action, disruption: r.disruption, prediction, heads_up });
  } catch (e) {
    console.error("disruption-monitor failed", e);
    return json(500, { error: "failed to run disruption monitor" });
  }
}
