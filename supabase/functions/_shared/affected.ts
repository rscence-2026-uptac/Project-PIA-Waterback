// Spec 03: affected-area mapping (pure logic + request handler with injected data access).
import { isLowPressureZone } from "./constants.generated.ts";
import type { FetchData } from "./handler.ts";
import type { FetchLive } from "./forecast.ts";
import { makeLiveFetcher } from "./forecast.ts";
import { json, parseAsOf, preflight, UUID_RE } from "./http.ts";
import type { PredictorOutput } from "./predict.ts";
import { runPredictor } from "./predictor_runner.ts";
import { residentState } from "./resident_state.generated.ts";
import type { DisruptionCause, ResidentStateKind, ServiceLevel } from "./resident_state.generated.ts";
import type { DisruptionRow } from "./disruption_monitor.ts";

export type CoverageSource = "cwd_service_map" | "estimate" | "unknown";
export interface BarangayRow {
  barangay_id: string;
  zone: number | null;
  service_level: ServiceLevel;
  piped_households: number | null;
  unpiped_households: number | null;
  coverage_source: CoverageSource;
  critical_facilities: string[];
}
export interface AffectedAreaOut {
  barangay_id: string;
  /** NULL when no disruption is open (spec 03 contract change; was non-null uuid). */
  disruption_id: string | null;
  signal_level: number;
  zone: number | null;
  service_level: ServiceLevel;
  low_pressure_zone: boolean;
  piped_households_affected: number | null;
  unpiped_households_affected: number | null;
  coverage_confidence: "confirmed" | "estimate" | "unknown";
  vulnerable_flag: boolean;
  /** Extra fields (not in the spec 03 zod object; Dev B's parse strips them). */
  resident_state: ResidentStateKind;
  heads_up: boolean;
}

export function buildAffectedAreas(
  barangays: BarangayRow[],
  ctx: { signal_level: number; cause: DisruptionCause | null; disruption_id: string | null; min_signal?: number },
): AffectedAreaOut[] {
  if (ctx.signal_level < (ctx.min_signal ?? 0)) return [];
  return barangays.map((b) => {
    const rs = residentState(ctx.signal_level, ctx.cause, b.service_level);
    const unserved = b.service_level === "unserved";
    // Unknown unless we have both counts AND a source for them: never show a guessed number (spec 03 AC).
    const known = !unserved && b.piped_households != null && b.unpiped_households != null && b.coverage_source !== "unknown";
    let piped: number | null = null, unpiped: number | null = null;
    if (known) {
      if (b.service_level === "level_i") { piped = 0; unpiped = (b.piped_households as number) + (b.unpiped_households as number); } // Level I = communal points = unpiped (equity layer)
      else { piped = b.piped_households; unpiped = b.unpiped_households; }
    }
    return {
      barangay_id: b.barangay_id,
      disruption_id: ctx.disruption_id,
      signal_level: ctx.signal_level, // blended network: every barangay inherits the system signal
      zone: b.zone,
      service_level: b.service_level,
      low_pressure_zone: isLowPressureZone(b.zone),
      piped_households_affected: piped,
      unpiped_households_affected: unpiped,
      coverage_confidence: known ? (b.coverage_source === "cwd_service_map" ? "confirmed" : "estimate") : "unknown",
      vulnerable_flag: b.critical_facilities.length > 0, // residents.is_vulnerable is PII: not used here
      resident_state: rs.state,
      heads_up: rs.heads_up,
    };
  });
}

export interface AffectedDeps {
  fetchData: FetchData;
  fetchBarangays: () => Promise<BarangayRow[]>;
  findOpen: () => Promise<DisruptionRow | null>;
  getById: (id: string) => Promise<DisruptionRow | null>;
  now?: () => Date;
  fetchLive?: FetchLive;
}

export async function handleAffectedAreas(req: Request, deps: AffectedDeps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "GET") return json(405, { error: "method not allowed" });
  const now = (deps.now ?? (() => new Date()))();
  const q = new URL(req.url).searchParams;

  const a = parseAsOf(q.get("as_of"), now);
  if (!a.ok) return json(400, { error: a.error });
  const rawMin = q.get("min_signal");
  const minSignal = rawMin == null || rawMin === "" ? 0 : Number(rawMin);
  if (!Number.isInteger(minSignal) || minSignal < 0 || minSignal > 4) return json(400, { error: "min_signal must be an integer 0-4" });
  const did = q.get("disruption_id");
  if (did != null && !UUID_RE.test(did)) return json(400, { error: "disruption_id must be a uuid" });

  try {
    const disruption = did ? await deps.getById(did) : await deps.findOpen();
    if (did && !disruption) return json(404, { error: "disruption not found" });
    const [prediction, barangays] = await Promise.all([
      runPredictor(deps.fetchData, a.asOf, now, deps.fetchLive ?? makeLiveFetcher()),
      deps.fetchBarangays(),
    ]);
    const cause = disruption?.cause ?? causeOf(prediction);
    return json(200, buildAffectedAreas(barangays, { signal_level: prediction.signal_level, cause, disruption_id: disruption?.id ?? null, min_signal: minSignal }));
  } catch (e) {
    console.error("affected-areas failed", e);
    return json(500, { error: "failed to compute affected areas" });
  }
}

/** The cause whose model signals higher (ties -> turbidity). */
export const causeOf = (p: PredictorOutput): "turbidity" | "drought" => (p.drought_level > p.turbidity_level ? "drought" : "turbidity");
