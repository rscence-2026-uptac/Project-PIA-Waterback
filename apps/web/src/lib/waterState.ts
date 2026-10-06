// Signal level (0–4) → the wireframe's water states. Resident state v2 (specs/03, Dev A decision):
// a PREDICTION never says water is off. 0 Flowing; 1–4 Heads-up (urgency by level) until an interruption is
// OBSERVED (disruption confirmed/deployed/notified, or Kulador plant degraded/shutdown); then Interrupted,
// or "Planned repair" when the cause is repair. Mirrors packages/shared-types residentState.
import type { Cause } from "../data/mock";

export type WaterState = "flowing" | "headsup" | "interrupted" | "repair";
export type DropLook = "flowing" | "headsup" | "muddy" | "low" | "repair";
export type HeadsUpUrgency = "possible" | "likely" | "very_likely";
/** API `resident_state` values (affected-areas / dashboard-snapshot). */
export type ApiResidentState = "flowing" | "heads_up" | "planned_repair" | "interrupted" | "not_on_network";

export interface WaterStateOptions {
  /** True only when water has actually stopped. Default false = prediction only (never "interrupted"). */
  interruptionObserved?: boolean;
}

export function waterState(signalLevel: number, cause: Cause | null, opts: WaterStateOptions = {}): WaterState {
  if (signalLevel <= 0) return "flowing";
  if (!opts.interruptionObserved) return "headsup";
  return cause === "repair" ? "repair" : "interrupted";
}

/** Same rule as the server's interruption_observed: card/disruption status confirmed|deployed|notified, or plant degraded|shutdown. */
export function interruptionObserved(status: string | null | undefined, plantStatus?: string | null): boolean {
  return status === "confirmed" || status === "deployed" || status === "notified" || plantStatus === "degraded" || plantStatus === "shutdown";
}

/** 1 possible, 2 likely, 3–4 very_likely; undefined at 0. */
export function headsUpUrgency(signalLevel: number): HeadsUpUrgency | undefined {
  return signalLevel <= 0 ? undefined : signalLevel === 1 ? "possible" : signalLevel === 2 ? "likely" : "very_likely";
}

/** Headline copy key for the heads-up card; pass hasTime when a likely_at/heads_up_from time can fill {time}. */
export function headsUpHeadlineKey(
  urgency: HeadsUpUrgency | undefined, hasTime = false,
): "state.headsup.possible.headline" | "state.headsup.headline" | "state.headsup.very_likely.headline" | "state.headsup.very_likely.headline_at" {
  if (urgency === "possible") return "state.headsup.possible.headline";
  if (urgency === "very_likely") return hasTime ? "state.headsup.very_likely.headline_at" : "state.headsup.very_likely.headline";
  return "state.headsup.headline";
}

/** Map the API's resident_state to the screen state (not_on_network has no water state: the caller shows its own card). */
export function waterStateFromApi(rs: ApiResidentState): WaterState {
  return rs === "heads_up" ? "headsup" : rs === "planned_repair" ? "repair" : rs === "interrupted" ? "interrupted" : "flowing";
}

/** How the drop gauge looks: level, colour and whether it ripples (DESIGN.md, Drop Gauge). */
export function dropLook(state: WaterState, cause: Cause | null): DropLook {
  if (state === "interrupted") return cause === "drought" ? "low" : "muddy";
  return state;
}
