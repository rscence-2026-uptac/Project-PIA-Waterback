// Resident state v2: has water actually stopped? (pure, no heavy imports; used by affected.ts and dashboard_snapshot.ts)
/** Disruption statuses that mean the interruption is real (a human confirmed it / crews are out / residents were told). */
export const OBSERVED_STATUSES: readonly string[] = ["confirmed", "deployed", "notified"];
/**
 * interruption_observed (resident-state v2): disruption confirmed/deployed/notified (covers cause=repair with a confirmed
 * disruption), OR the latest Kulador plant_status at as_of is degraded/shutdown. A prediction alone is never "observed".
 */
export function interruptionObserved(status: string | null | undefined, plant: string | null | undefined): boolean {
  return (status != null && OBSERVED_STATUSES.includes(status)) || plant === "degraded" || plant === "shutdown";
}
/** plant_status of the newest Kulador reading at or before asOf (null when none). */
export function latestKuladorStatus(readings: { recorded_at: string; intake_id: string; plant_status: string }[], asOf: Date): string | null {
  let best: { t: number; s: string } | null = null;
  for (const r of readings) {
    const t = Date.parse(r.recorded_at);
    if (r.intake_id === "kulador" && t <= asOf.getTime() && (!best || t >= best.t)) best = { t, s: r.plant_status };
  }
  return best?.s ?? null;
}
