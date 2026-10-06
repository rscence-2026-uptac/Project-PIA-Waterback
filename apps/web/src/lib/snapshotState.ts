// The water state a screen shows for a barangay snapshot. Live snapshots carry the server's
// `resident_state` (the accepted mapping, specs/03); sample snapshots fall back to the signal rule.
import type { BarangaySnapshot } from "../data/mock";
import { waterState, waterStateFromApi, type WaterState } from "./waterState";

export function snapshotWaterState(snapshot: BarangaySnapshot, signalLevel: number): WaterState {
  const rs = snapshot.resident_state;
  if (rs === "not_on_network") return signalLevel >= 2 ? "headsup" : "flowing"; // unserved: its own card is the mockup's job
  if (rs) return waterStateFromApi(rs);
  return waterState(signalLevel, snapshot.detail.cause, { interruptionObserved: snapshot.interruption_observed });
}
