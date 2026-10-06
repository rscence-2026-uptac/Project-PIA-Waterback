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
  return fn === "deploy-response" ? isDone(disruptionId, "allocated") : isDone(disruptionId, "deployed");
}

/**
 * Single seam to Supabase. Until the functions exist it throws BackendNotConnected.
 * When they do, replace the body with the commented fetch below.
 */
async function callEdge(fn: EdgeFn, _body: unknown): Promise<void> {
  void _body;
  // TODO(Dev A): enable once supabase/functions/<fn> is deployed.
  // const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
  //   body: JSON.stringify(_body),
  // });
  // if (res.status === 409) throw new StepOutOfOrder(fn);
  // if (!res.ok) throw new Error(`${fn} failed with ${res.status}`);
  // return;
  throw new BackendNotConnected(fn);
}

/** Saves the officer's order and writes the `deployed` event. */
export async function confirmAllocation(decisions: AllocationDecision[]): Promise<void> {
  z.array(AllocationDecision).min(1).parse(decisions);
  await callEdge("confirm-allocation", decisions);
  markDone(decisions[0].disruption_id, "allocated");
}

/** Records which ranked source was actually sent to a barangay. */
export async function deployResponse(response: DeployResponse): Promise<void> {
  DeployResponse.parse(response);
  if (!canRun(response.disruption_id, "deploy-response")) throw new StepOutOfOrder("deploy-response");
  await callEdge("deploy-response", response);
  markDone(response.disruption_id, "deployed");
}

/** Sends the PWA push + Semaphore SMS and writes the `notified` event. */
export async function notifyResidents(payloads: NotificationPayload[]): Promise<void> {
  z.array(NotificationPayload).min(1).parse(payloads);
  const disruptionId = payloads[0].disruption_id;
  if (!canRun(disruptionId, "notify-residents")) throw new StepOutOfOrder("notify-residents");
  await callEdge("notify-residents", payloads);
  markDone(disruptionId, "notified");
}