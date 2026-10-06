import type { SignalLevel } from "./constants";

export type ServiceLevel = "level_iii" | "level_i" | "unserved";
export type DisruptionCause = "turbidity" | "drought" | "repair";
export type ResidentStateKind = "flowing" | "heads_up" | "planned_repair" | "interrupted" | "not_on_network";

export type HeadsUpUrgency = "possible" | "likely" | "very_likely";

export interface ResidentState {
  state: ResidentStateKind;
  /** Store-water-tonight prompt. For 'not_on_network' it flags that backup sources will get busier (signal >= 2). */
  heads_up: boolean;
  /** Present when heads_up is true: 1 possible ("Water may stop"), 2 likely ("Store water tonight"), 3-4 very_likely ("Water likely to stop from <time>"). */
  heads_up_urgency?: HeadsUpUrgency;
}

export interface ResidentStateOptions {
  /**
   * True only when water has ACTUALLY stopped (or a repair is confirmed): the disruption is confirmed/deployed/notified for the
   * barangay, OR the latest Kulador plant_status at as_of is 'degraded'/'shutdown', OR cause = repair with a confirmed disruption.
   * Undefined/false = prediction only: the resident is never told water is off.
   */
  interruption_observed?: boolean;
}

export const headsUpUrgency = (signal_level: number): HeadsUpUrgency | undefined =>
  signal_level <= 0 ? undefined : signal_level === 1 ? "possible" : signal_level === 2 ? "likely" : "very_likely";

/**
 * What a resident's screen shows (specs/03 mapping table, v2 "a prediction never says water is off").
 * unserved -> not_on_network (+ heads_up when signal >= 2); signal 0 -> flowing; signal >= 1 and no observed interruption ->
 * heads_up (urgency by signal); observed interruption -> interrupted, or planned_repair when cause = repair.
 * (A barangay already restored is 'flowing' at signal 0: callers pass signal 0 once resolved.)
 */
export function residentState(
  signal_level: SignalLevel | number,
  cause: DisruptionCause | null | undefined,
  service_level: ServiceLevel,
  options: ResidentStateOptions = {},
): ResidentState {
  if (service_level === "unserved") {
    const heads_up = signal_level >= 2;
    return heads_up ? { state: "not_on_network", heads_up, heads_up_urgency: headsUpUrgency(signal_level) } : { state: "not_on_network", heads_up };
  }
  if (signal_level <= 0) return { state: "flowing", heads_up: false };
  if (!options.interruption_observed) return { state: "heads_up", heads_up: true, heads_up_urgency: headsUpUrgency(signal_level) };
  return { state: cause === "repair" ? "planned_repair" : "interrupted", heads_up: false };
}
