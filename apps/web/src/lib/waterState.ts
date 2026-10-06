// Signal level (0–4) → the wireframe's water states.
// FLAG: no spec defines this mapping yet. Proposed: 0 Flowing, 1–2 Heads-up, 3–4 Interrupted;
// an interruption caused by repair shows as "Planned repair".
import type { Cause } from "../data/mock";

export type WaterState = "flowing" | "headsup" | "interrupted" | "repair";
export type DropLook = "flowing" | "headsup" | "muddy" | "low" | "repair";

export function waterState(signalLevel: number, cause: Cause | null): WaterState {
  if (signalLevel <= 0) return "flowing";
  if (signalLevel <= 2) return "headsup";
  return cause === "repair" ? "repair" : "interrupted";
}

/** How the drop gauge looks: level, colour and whether it ripples (DESIGN.md, Drop Gauge). */
export function dropLook(state: WaterState, cause: Cause | null): DropLook {
  if (state === "interrupted") return cause === "drought" ? "low" : "muddy";
  return state;
}
