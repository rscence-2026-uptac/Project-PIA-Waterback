// Resident/captain status from the live backend, shaped as the BarangaySnapshot the screens already read.
//   predictor            -> signal + drivers + operator_actions (spec 02)
//   affected-areas       -> this barangay's resident_state / heads-up (spec 03, all 57 barangays)
//   dashboard-snapshot   -> the open disruption (cause, windows) + this barangay's lifecycle card (spec 07)
//   rank-chain / sources -> backup sources (spec 04); REST `sources` when no disruption exists
// Storage plan = the heads-up rule (4 people x 15 L = 60 L), a constant, not sample data. Captain day: sources and the
// delivered count are live; the captain name, "went to a working source" and thank-yous have no backend and are sample-only.
import type { PredictorOutput } from "../contracts/predictor";
import type { AffectedArea } from "../contracts/spec03";
import type { RankedSource } from "../contracts/spec04";
import type { DashboardSnapshot, DisruptionInfo } from "../contracts/spec07";
import { mockSnapshot, type BackupSource, type BarangaySnapshot, type CaptainDay, type Cause } from "../data/mock";
import { SEED_SOURCES, type SeedSource } from "../data/seedSources";
import { rankSeedSources, toBackupSource } from "../lib/backupSource";
import { interruptionObserved } from "../lib/waterState";
import { getAffectedAreas, getDashboardSnapshot, getPredictor, postRankChain } from "./endpoints";
import { fetchSmsCount, fetchSources, type SourceRow } from "./rest";

const HOUR = 3_600_000;

const toSeed = (row: SourceRow): SeedSource => ({
  id: row.id,
  barangay_id: row.barangay_id,
  name: row.name,
  type: row.type,
  safety_score: row.safety_score,
  travel_minutes: row.travel_minutes,
  cost_php_per_unit: row.cost_php_per_unit,
  active: row.active,
  network_dependent: row.type === "neighboring_barangay", // the column isn't selected (rest.ts); same rule as backupSource.ts
  provenance: row.provenance ?? "placeholder",
  is_simulated: row.is_simulated ?? (row.provenance ?? "placeholder") === "placeholder",
  source_ref: row.source_ref ?? null,
  lat: row.lat ?? null,
  lng: row.lng ?? null,
});

const rankedToSeed = (r: RankedSource, row: SourceRow | undefined): SeedSource => ({
  id: r.source_id,
  barangay_id: row?.barangay_id ?? "",
  name: r.name,
  type: r.type,
  safety_score: r.safety_score,
  travel_minutes: r.travel_minutes,
  cost_php_per_unit: r.cost_php_per_unit,
  active: true,
  network_dependent: r.type === "neighboring_barangay",
  provenance: r.provenance ?? row?.provenance ?? "placeholder",
  is_simulated: r.is_simulated ?? row?.is_simulated ?? false,
  source_ref: r.source_ref ?? row?.source_ref ?? null,
  lat: row?.lat ?? null,
  lng: row?.lng ?? null,
});

/** Sources for the barangay: the ranked chain when a disruption is open, else REST rows ordered like spec 04. */
export async function loadSources(barangayId: string, disruption: DisruptionInfo | null, cause: Cause | null, signal?: AbortSignal): Promise<BackupSource[]> {
  const [rows, chain] = await Promise.all([
    fetchSources(barangayId).catch(() => null),
    disruption && disruption.status !== "resolved"
      ? postRankChain(barangayId, disruption.id, signal).catch(() => null)
      : Promise.resolve(null),
  ]);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  if (chain && chain.ranked_sources.length > 0) {
    return [...chain.ranked_sources].sort((a, b) => a.rank - b.rank).map((r, i) => toBackupSource(rankedToSeed(r, byId.get(r.source_id)), i));
  }
  if (rows && rows.length > 0) return rankSeedSources(rows.map(toSeed), cause).map(toBackupSource);
  // Neither endpoint answered: the bundled copy of Dev A's seed (same ranking rule).
  return rankSeedSources(SEED_SOURCES.filter((s) => s.barangay_id === barangayId), cause).map(toBackupSource);
}

function causeFromPrediction(p: PredictorOutput | null): Cause | null {
  if (!p || p.signal_level < 2) return null;
  return p.turbidity_level >= p.drought_level ? "turbidity" : "drought";
}

/** Whole status read for one barangay at `asOf`. Throws only when no endpoint answered. */
export async function fetchLiveSnapshot(barangayId: string, asOf: Date, signal?: AbortSignal): Promise<BarangaySnapshot> {
  const base = mockSnapshot(barangayId);
  if (!base) throw new Error(`Unknown barangay ${barangayId}`);

  const [prediction, areas, dash] = await Promise.all([
    getPredictor(asOf, signal).catch(() => null),
    getAffectedAreas(asOf, { signal }).catch(() => null),
    getDashboardSnapshot(asOf, signal).catch(() => null),
  ]);
  if (!areas && !dash) throw new Error("status endpoints unreachable");

  const area: AffectedArea | undefined = areas?.find((a) => a.barangay_id === barangayId);
  const disruption = dash?.disruption ?? null;
  // With no disruption every card reads "resolved / signal 0": that is the default, not a verdict. Use the prediction then.
  const card: DashboardSnapshot["barangays"][number] | undefined = disruption ? dash?.barangays.find((b) => b.barangay_id === barangayId) : undefined;
  const open = disruption && disruption.status !== "resolved" ? disruption : null;

  const signal_level = card?.signal_level ?? area?.signal_level ?? prediction?.signal_level ?? 0;
  const status_label = card?.status ?? null;
  const observed = interruptionObserved(open?.status ?? null);
  const cause: Cause | null = open?.cause ?? causeFromPrediction(prediction);
  const restored = card?.status === "resolved" && disruption ? card.last_event_at : null;
  const iso = asOf.toISOString();

  const [sources, delivered] = await Promise.all([
    loadSources(barangayId, open, cause, signal),
    fetchSmsCount(barangayId, open?.id ?? null).catch(() => null),
  ]);
  const captain: CaptainDay = {
    // Sample-only (no backend): to_working, checks_today, thanks, more_thanks. The screens label them "Sample" when `live` is set.
    ...base.captain, name: "captain", households_reached: 0, delivered, live: true,
    // The morning round checks the real backup sources of this barangay (never trucks or neighbour supply: nobody checks those on foot).
    sources: sources
      .filter((s) => s.type !== "trucking" && s.type !== "neighboring_barangay")
      .slice(0, 4)
      .map((s) => ({ id: s.source_id, name: s.name, letter: s.letter, safety: s.safety, checked_at: null, status: null })),
  };

  return {
    ...base,
    live: true,
    as_of: iso,
    status: { barangay_id: barangayId, signal_level, last_synced_at: new Date().toISOString() },
    detail: {
      disruption_id: open?.id ?? null,
      cause,
      // The disruption's started_at is the PREDICTION time. It only reads as "water stopped" once an interruption is observed.
      started_at: observed ? open?.started_at ?? null : null,
      updated_at: dash?.generated_at ?? iso,
      window_start: open?.window_start ?? null,
      window_end: open?.window_end ?? null,
      likely_at: open?.likely_at ?? null,
      next_update_at: open?.next_update_at ?? new Date(asOf.getTime() + 2 * HOUR).toISOString(),
      heads_up_from: open?.heads_up_from ?? (signal_level >= 1 && signal_level <= 2 ? iso : null),
      restored_at: restored,
    },
    sources,
    captain,
    resident_state: card?.resident_state ?? area?.resident_state,
    heads_up_urgency: card?.heads_up_urgency ?? area?.heads_up_urgency,
    interruption_observed: observed,
    prediction,
    status_label,
  };
}
