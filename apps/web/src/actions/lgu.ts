// SPEC: 06 — the one place that talks to Dev A's backend for the Action phase.
// Every input is checked against the spec contract first, so the screens are already
// producing valid data. Until the Edge Functions exist, each call stops with
// BackendNotConnected and the screen shows its "not connected yet" state.
import { z } from "zod";
import { AllocationDecision, DeployResponse, NotificationPayload } from "../contracts/spec06";

export class BackendNotConnected extends Error {
  readonly fn: string;
  constructor(fn: string) {
    super(`Edge Function "${fn}" is not available yet`);
    this.fn = fn;
  }
}

/** Saves the officer's order and writes the `deployed` event. */
export async function confirmAllocation(decisions: AllocationDecision[]): Promise<void> {
  z.array(AllocationDecision).min(1).parse(decisions);
  // TODO(Dev A): POST to supabase/functions/allocate (service_role writes allocations + event_log).
  throw new BackendNotConnected("allocate");
}

/** Records which ranked source was actually sent to a barangay. */
export async function deployResponse(response: DeployResponse): Promise<void> {
  DeployResponse.parse(response);
  // TODO(Dev A): POST to supabase/functions/allocate (deploy step).
  throw new BackendNotConnected("allocate");
}

/** Sends the PWA push + Semaphore SMS and writes the `notified` event. */
export async function notifyResidents(payloads: NotificationPayload[]): Promise<void> {
  z.array(NotificationPayload).min(1).parse(payloads);
  // TODO(Dev A): POST to supabase/functions/notify (Semaphore key lives in Supabase secrets).
  throw new BackendNotConnected("notify");
}
