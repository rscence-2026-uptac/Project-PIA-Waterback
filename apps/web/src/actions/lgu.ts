// SPEC: 06 — the one place that talks to Dev A's backend for the Action phase.
// Every input is checked against the spec contract first, so the screens are already
// producing valid data. Until the Edge Functions exist, each call stops with
// BackendNotConnected and the screen shows its "not connected yet" state.
//
// Edge Functions (real names, per Dev A):
//   confirm-allocation  -> confirmAllocation()
//   deploy-response     -> deployResponse()
//   notify-residents    -> notifyResidents()
//
// Step order is strict: confirm -> allocate -> deploy -> notify. The server answers 409 to a
// call that skips a step. This file also checks the order on the client first, so the UI
// never has to rely on the 409 as its normal path.
import { z } from "zod";
import { AllocationDecision, DeployResponse, NotificationPayload } from "../contracts/spec06";
import { ApiError, backendConfigured, callFunction } from "../lib/api";

export class BackendNotConnected extends Error {
  readonly fn: string;
  constructor(fn: string) {
    super(`Edge Function "${fn}" is not available yet`);
    this.fn = fn;
  }
}

/** A call skipped a step (server 409, or caught on the client before sending). */
export class StepOutOfOrder extends Error {
  readonly fn: string;
  constructor(fn: string) {
    super(`"${fn}" was called before the step it depends on was done`);
    this.fn = fn;
  }
}

type EdgeFn = "confirm-allocation" | "deploy-response" | "notify-residents";
type Step = "allocated" | "deployed" | "notified";

// Steps that succeeded this session, per disruption. Cosmetic guard only: the server is the
// source of truth and still returns 409 if this ever disagrees with it.
const completed = new Map<string, Set<Step>>();
const isDone = (disruptionId: string, step: Step) => completed.get(disruptionId)?.has(step) ?? false;
function markDone(disruptionId: string, step: Step) {
  const steps = completed.get(disruptionId) ?? new Set<Step>();
  steps.add(step);
  completed.set(disruptionId, steps);
}

/** Whether the UI may offer a step yet (use this to disable the Deploy / Notify buttons). */
export function canRun(disruptionId: string, fn: Exclude<EdgeFn, "confirm-allocation">): boolean {
  if (fn === "deploy-response") return isDone(disruptionId, "allocated");
  // The real backend sets the disruption to `deployed` as soon as confirm-allocation succeeds, and that is all
  // notify-residents needs (supabase/functions/README.md). deploy-response (a specific source) is not required first.
  return isDone(disruptionId, "deployed") || isDone(disruptionId, "allocated");
}

/**
 * Single seam to Supabase. Not configured -> BackendNotConnected. A 409 (a step skipped) -> StepOutOfOrder.
 * Returns the server's JSON answer so callers can show real counts.
 */
async function callEdge<T = unknown>(fn: EdgeFn, body: unknown): Promise<T> {
  if (!backendConfigured) throw new BackendNotConnected(fn);
  try {
    return await callFunction<T>(fn, { body });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) throw new StepOutOfOrder(fn);
    throw error;
  }
}

/** Saves the officer's order and writes the `deployed` event. */
export async function confirmAllocation(decisions: AllocationDecision[]): Promise<{ allocations: number; events_written: number }> {
  z.array(AllocationDecision).min(1).parse(decisions);
  const result = await callEdge<{ allocations: number; events_written: number }>("confirm-allocation", decisions);
  markDone(decisions[0].disruption_id, "allocated");
  return result;
}

/** Records which ranked source was actually sent to a barangay. */
export async function deployResponse(response: DeployResponse): Promise<void> {
  DeployResponse.parse(response);
  if (!canRun(response.disruption_id, "deploy-response")) throw new StepOutOfOrder("deploy-response");
  await callEdge("deploy-response", response);
  markDone(response.disruption_id, "deployed");
}

/** Sends the PWA push + Semaphore SMS and writes the `notified` event. */
export interface NotifyResult {
  notified: { barangay_id: string; channels: string[]; sms_recipients: number }[];
  sms?: { mode?: string; planned?: number; sent?: number; failed?: number };
}
export async function notifyResidents(payloads: NotificationPayload[]): Promise<NotifyResult> {
  z.array(NotificationPayload).min(1).parse(payloads);
  const disruptionId = payloads[0].disruption_id;
  if (!canRun(disruptionId, "notify-residents")) throw new StepOutOfOrder("notify-residents");
  const result = await callEdge<NotifyResult>("notify-residents", payloads);
  markDone(disruptionId, "notified");
  return result;
}