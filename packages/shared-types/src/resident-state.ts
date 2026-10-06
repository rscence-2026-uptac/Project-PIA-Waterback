import type { SignalLevel } from "./constants";

export type ServiceLevel = "level_iii" | "level_i" | "unserved";
export type DisruptionCause = "turbidity" | "drought" | "repair";
export type ResidentStateKind = "flowing" | "heads_up" | "planned_repair" | "interrupted" | "not_on_network";

export interface ResidentState {
  state: ResidentStateKind;
  /** Store-water-tonight prompt. For 'not_on_network' it flags that backup sources will get busier (signal >= 2). */
  heads_up: boolean;
}

/**
 * What a resident's screen shows (specs/03 mapping table, accepted from Dev B's proposal).
 * unserved -> not_on_network (+ heads_up when signal >= 2); else 0 flowing, 1-2 heads_up,
 * 3-4 interrupted, or planned_repair when cause = repair.
 */
export function residentState(
  signal_level: SignalLevel | number,
  cause: DisruptionCause | null | undefined,
  service_level: ServiceLevel,
): ResidentState {
  if (service_level === "unserved") return { state: "not_on_network", heads_up: signal_level >= 2 };
  if (signal_level <= 0) return { state: "flowing", heads_up: false };
  if (signal_level <= 2) return { state: "heads_up", heads_up: true };
  return { state: cause === "repair" ? "planned_repair" : "interrupted", heads_up: false };
}
