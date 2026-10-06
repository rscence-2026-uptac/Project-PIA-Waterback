// SPEC: 06 — the one place that talks to Dev A's backend for the Action phase.
// Every input is checked against the spec contract first, so the screens are already
// producing valid data. In live mode each call goes to its Edge Function; without Supabase env
// vars it stops with BackendNotConnected and the screen shows its "not connected yet" state.
//
// Edge Functions:
//   confirm-allocation  -> confirmAllocation()
//   deploy-response     -> deployResponse()
//   notify-residents    -> notifyResidents()
//
// Step order is strict: confirm -> allocate -> deploy -> notify. The server answers 409 to a
// call that skips a step (the source of truth). In live mode the client does not pre-check the
// order, so a reload mid-demo never blocks a step the server would accept; without a backend the
// in-session guard below keeps the offline demo honest.
import { z } from "zod";
import { isLive } from "../api/client";
import { ApiError } from "../api/http";
import { postConfirmAllocation, postDeployResponse, postNotifyResidents } from "../api/endpoints";
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

/** Single seam to Supabase. Maps 409 to StepOutOfOrder and a missing backend to BackendNotConnected. */
async function callEdge(fn: EdgeFn, body: unknown): Promise<void> {
  if (!isLive()) throw new BackendNotConnected(fn);
  try {
    if (fn === "confirm-allocation") await postConfirmAllocation(body as AllocationDecision[]);
    else if (fn === "deploy-response") await postDeployResponse(body as DeployResponse);
    else await postNotifyResidents(body as NotificationPayload[]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) throw new StepOutOfOrder(fn);
    throw error;
  }
}

/** Saves the officer's order and writes the `deployed` event. */
export async function confirmAllocation(decisions: AllocationDecision[]): Promise<void> {
  z.array(AllocationDecision).min(1).parse(decisions);
  // The server wants one row per barangay: drop the client-only consumer_type grouping field.
  await callEdge("confirm-allocation", isLive() ? decisions.map((d) => ({ ...d, consumer_type: undefined })) : decisions);
  markDone(decisions[0].disruption_id, "allocated");
}

/** Records which ranked source was actually sent to a barangay. */
export async function deployResponse(response: DeployResponse): Promise<void> {
  DeployResponse.parse(response);
  if (!isLive() && !canRun(response.disruption_id, "deploy-response")) throw new StepOutOfOrder("deploy-response");
  await callEdge("deploy-response", response);
  markDone(response.disruption_id, "deployed");
}

/** Sends the PWA push + Semaphore SMS and writes the `notified` event. */
export async function notifyResidents(payloads: NotificationPayload[]): Promise<void> {
  z.array(NotificationPayload).min(1).parse(payloads);
  const disruptionId = payloads[0].disruption_id;
  if (!isLive() && !canRun(disruptionId, "notify-residents")) throw new StepOutOfOrder("notify-residents");
  await callEdge("notify-residents", payloads);
  markDone(disruptionId, "notified");
}