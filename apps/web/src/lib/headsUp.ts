import type { BarangaySnapshot } from "../data/mock";

/** Likely start of the interruption: the open disruption's likely_at, else its heads_up_from; null = unknown. */
export function likelyStart(snapshot: BarangaySnapshot): string | null {
  const { detail } = snapshot;
  return detail.likely_at ?? (detail.disruption_id ? detail.heads_up_from : null) ?? null;
}

