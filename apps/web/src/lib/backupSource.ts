// SPEC: 04 — rank one barangay's seed sources the way Dev A's rank-chain does, then add the fields
// the resident screens show. Mirrors rankSources() in supabase/functions/_shared/ranking.ts; once
// the app reads RankedChain from the API, only toBackupSource() is still needed.
import { WSP_CONSTANTS } from "../contracts/wsp";
import type { BackupSource, Cause, Safety } from "../data/mock";
import type { SeedSource } from "../data/seedSources";

// Dev A's rule: on a system-wide cause the blended network is down everywhere, so a neighbouring
// barangay is dry too (WSP pp.12, 15). Same list as isSystemWide() in ranking.ts.
const SYSTEM_WIDE: Cause[] = ["turbidity", "drought"];

export function rankSeedSources(rows: SeedSource[], cause: Cause | null): SeedSource[] {
  return rows
    .filter((s) => s.active)
    .filter((s) => !(s.type === "neighboring_barangay" && cause !== null && SYSTEM_WIDE.includes(cause)))
    .sort((a, b) =>
      (b.safety_score - a.safety_score)
      || (a.travel_minutes - b.travel_minutes)
      || (a.cost_php_per_unit - b.cost_php_per_unit)
      || a.id.localeCompare(b.id));
}

// UI wording for a safety score. Thresholds are ours, not Dev A's rubric: 0.8+ is treated or sealed
// (refill stations, chlorinated trucks), 0.4+ is untreated but usable if boiled (open wells).
function safetyOf(score: number): Safety {
  if (score >= 0.8) return "safe";
  if (score >= 0.4) return "boil";
  return "washing";
}

// Dev A's refill prices are per 5-gallon container (sources.sql source_ref: "PHP25/5gal") ≈ 19 L.
const FIVE_GALLON_LITRES = 19;

export function toBackupSource(seed: SeedSource, index: number): BackupSource {
  return {
    source_id: seed.id,
    name: seed.name,
    type: seed.type,
    safety_score: seed.safety_score,
    travel_minutes: seed.travel_minutes,
    exceeds_jmp_benchmark: seed.travel_minutes > WSP_CONSTANTS.JMP_ROUNDTRIP_MIN,
    cost_php_per_unit: seed.cost_php_per_unit,
    rank: index + 1,
    provenance: seed.provenance,
    is_simulated: seed.is_simulated,
    source_ref: seed.source_ref,
    letter: String.fromCharCode(65 + index), // Plan A, B, C…
    walk_minutes: Math.max(1, Math.round(seed.travel_minutes / 2)), // travel_minutes is the round trip
    safety: safetyOf(seed.safety_score),
    price_litres: seed.cost_php_per_unit > 0 ? FIVE_GALLON_LITRES : null,
    bring_containers: seed.type === "trucking",
    note: null,
    lat: seed.lat,
    lng: seed.lng,
  };
}
