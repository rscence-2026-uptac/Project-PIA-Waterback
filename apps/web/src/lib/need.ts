// SPEC: 10 — need score, truck drop points, early-warning tiers, access-gap sites. Pure functions, no React.
import {
  DEPOT, FACILITY_WEIGHT, LITRES_PER_PERSON_DAY, MAX_TIME_FACTOR, NO_ACCESS_WEIGHT, SAFE_SOURCE_MIN_SCORE,
  TIER1_TOP_SHARE, TRUCK_WALK_RADIUS_M, VULNERABLE_WEIGHT,
  type Cluster, type NeedRow,
} from "../contracts/spec10.ts";
import { WSP_CONSTANTS } from "../contracts/wsp.ts";
import { metresBetween, roundTripMinutes } from "./geo.ts";
import type { ClustersFile } from "../data/needInputs";
import type { Facility } from "../data/mockLgu";
import type { SeedSource } from "../data/seedSources";

const FACILITY_TEXT: Record<Facility, string> = {
  health_station: "health station", evacuation_center: "evacuation center", school: "school", barangay_hall: "barangay hall",
};
const nf = new Intl.NumberFormat("en-US");
const HOUR_MS = 3_600_000;

export interface ScoreInput {
  clusters: Cluster[];
  barangays: ClustersFile["barangays"];
  sources: Pick<SeedSource, "name" | "active" | "safety_score" | "lat" | "lng">[];
  vulnerableByBarangay: Record<string, number>;
  facilitiesByBarangay: Record<string, Facility[]>;
  startedAt: string | Date | null;
  now: string | Date;
}

export function scoreClusters(input: ScoreInput): NeedRow[] {
  const { clusters, barangays, sources, vulnerableByBarangay, facilitiesByBarangay, startedAt, now } = input;

  // Safe sources city-wide, deduped (the seed repeats one facility per barangay).
  const seen = new Set<string>();
  const safe: { lat: number; lng: number }[] = [];
  for (const s of sources) {
    if (!s.active || s.safety_score < SAFE_SOURCE_MIN_SCORE || s.lat === null || s.lng === null) continue;
    const key = `${s.lat}|${s.lng}|${s.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    safe.push({ lat: s.lat, lng: s.lng });
  }

  const level = new Map(barangays.map((b) => [b.barangay_id, b.service_level]));
  const totals = new Map<string, number>();
  const biggest = new Map<string, Cluster>();
  for (const c of clusters) {
    totals.set(c.barangay_id, (totals.get(c.barangay_id) ?? 0) + c.people);
    const top = biggest.get(c.barangay_id);
    if (!top || c.people > top.people || (c.people === top.people && c.cluster_id < top.cluster_id)) biggest.set(c.barangay_id, c);
  }

  const hoursDry = startedAt === null ? 0 : Math.max(0, (new Date(now).getTime() - new Date(startedAt).getTime()) / HOUR_MS);
  const timeFactor = Math.min(1 + hoursDry / 24, MAX_TIME_FACTOR);

  const rows = clusters.map((c): Omit<NeedRow, "suggested_rank"> => {
    const metres = safe.length ? Math.min(...safe.map((s) => metresBetween(c, s))) : null;
    const trip = metres === null ? null : roundTripMinutes(metres);
    const lvl = level.get(c.barangay_id);
    const noAccess = trip === null || trip > WSP_CONSTANTS.JMP_ROUNDTRIP_MIN || lvl === "level_i" || lvl === "unserved";

    const total = totals.get(c.barangay_id) ?? 0;
    const vulnerable = total > 0 ? (vulnerableByBarangay[c.barangay_id] ?? 0) * (c.people / total) : 0;
    const facilities = facilitiesByBarangay[c.barangay_id] ?? [];
    const hasFacility = facilities.length > 0 && biggest.get(c.barangay_id)?.cluster_id === c.cluster_id;

    const need = (c.people * (1 + NO_ACCESS_WEIGHT * (noAccess ? 1 : 0))
      + VULNERABLE_WEIGHT * vulnerable
      + FACILITY_WEIGHT * (hasFacility ? 1 : 0)) * timeFactor;

    const reasons = [`${nf.format(c.people)} people`];
    if (noAccess) reasons.push(`no safe water within ${WSP_CONSTANTS.JMP_ROUNDTRIP_MIN} min`);
    else reasons.push(`safe water ~${Math.round(trip)} min round trip`);
    if (vulnerable > 0) reasons.push(`~${nf.format(Math.max(1, Math.round(vulnerable)))} elderly or PWD (estimate)`);
    if (hasFacility) for (const f of facilities) reasons.push(FACILITY_TEXT[f]);
    if (hoursDry >= 1) reasons.push(`${nf.format(Math.round(hoursDry))} h without water`);

    return {
      cluster_id: c.cluster_id, barangay_id: c.barangay_id, label: c.label, people: c.people,
      vulnerable_est: vulnerable, has_critical_facility: hasFacility,
      nearest_safe_min: trip === null ? null : Math.round(trip), no_safe_access: noAccess,
      hours_dry: hoursDry, need_points: need, reasons,
    };
  });

  return rows
    .sort((a, b) => b.need_points - a.need_points || b.people - a.people || a.cluster_id.localeCompare(b.cluster_id))
    .map((r, i) => ({ ...r, suggested_rank: i + 1 }));
}

// ---------- Greedy max-coverage (drop points and access-gap sites share it) ----------

interface CoverPick { cluster: Cluster; covered: string[]; gain: number }

/** Picks up to `count` cluster centres, each covering the most still-uncovered weight within the walking radius. */
function greedyCover(clusters: Cluster[], weight: Map<string, number>, count: number, onPick?: (p: CoverPick) => boolean): CoverPick[] {
  const uncovered = new Set(clusters.filter((c) => (weight.get(c.cluster_id) ?? 0) > 0).map((c) => c.cluster_id));
  const picks: CoverPick[] = [];
  while (picks.length < count && uncovered.size > 0) {
    let best: CoverPick | null = null;
    for (const cand of clusters) {
      const covered = clusters
        .filter((c) => uncovered.has(c.cluster_id) && metresBetween(cand, c) <= TRUCK_WALK_RADIUS_M)
        .map((c) => c.cluster_id);
      const gain = covered.reduce((s, id) => s + (weight.get(id) ?? 0), 0);
      if (gain > 0 && (!best || gain > best.gain || (gain === best.gain && cand.cluster_id < best.cluster.cluster_id))) {
        best = { cluster: cand, covered, gain };
      }
    }
    if (!best) break;
    best.covered.forEach((id) => uncovered.delete(id));
    picks.push(best);
    if (onPick?.(best) === false) break; // caller says stop (e.g. capacity spent)
  }
  return picks;
}

export interface DropStop {
  order: number; cluster_id: string; label: string; lat: number; lng: number;
  covered_cluster_ids: string[];
  people: number; // people living within the walk radius of the stop
  people_served: number; // people this stop's load gives a day's drinking water (litres ÷ LITRES_PER_PERSON_DAY)
  litres: number; // one trip's load, or less if the people nearby need less
  capped?: boolean; // the people nearby need more than one trip's load
}
export interface DropPlan {
  stops: DropStop[];
  per_trip_litres: number;
  total_people: number; // people served across all stops
  total_litres: number;
  no_access_people: number; // everyone without safe water within 30 min, before trucks
  unmet_people: number; // of those, still without water after the trucks' load
}

// Each stop gets one trip's share of the truck water (capacity ÷ stops), so the trucks reach the
// `count` highest-need places instead of spending everything at the first one.
export function pickDropPoints(rows: NeedRow[], clusters: Cluster[], count: number, capacityLitres: number): DropPlan {
  const need = new Map(rows.map((r) => [r.cluster_id, r.need_points]));
  const people = new Map(clusters.map((c) => [c.cluster_id, c.people]));
  const perTrip = count > 0 ? Math.floor(capacityLitres / count) : 0;
  const raw: Omit<DropStop, "order">[] = [];
  greedyCover(clusters, need, count, (p) => {
    const near = p.covered.reduce((s, id) => s + (people.get(id) ?? 0), 0);
    const want = near * LITRES_PER_PERSON_DAY;
    const capped = want > perTrip;
    const litres = capped ? perTrip : want;
    raw.push({
      cluster_id: p.cluster.cluster_id, label: p.cluster.label, lat: p.cluster.lat, lng: p.cluster.lng,
      covered_cluster_ids: p.covered, people: near,
      people_served: Math.floor(litres / LITRES_PER_PERSON_DAY), litres, ...(capped ? { capped: true } : {}),
    });
    return true;
  });

  // Nearest-neighbour visit order from the depot.
  const stops: DropStop[] = [];
  let here: { lat: number; lng: number } = DEPOT;
  const left = [...raw];
  while (left.length) {
    let bi = 0;
    left.forEach((s, i) => { if (metresBetween(here, s) < metresBetween(here, left[bi])) bi = i; });
    const [s] = left.splice(bi, 1);
    stops.push({ ...s, order: stops.length + 1 });
    here = s;
  }

  const noAccess = new Set(rows.filter((r) => r.no_safe_access).map((r) => r.cluster_id));
  const noAccessPeople = rows.filter((r) => r.no_safe_access).reduce((s, r) => s + r.people, 0);
  // People served at stops that sit in no-access clusters reduce the unmet count.
  const servedNoAccess = stops.reduce((s, x) => {
    const near = x.covered_cluster_ids.filter((id) => noAccess.has(id)).reduce((n, id) => n + (people.get(id) ?? 0), 0);
    return s + Math.min(x.people_served, near);
  }, 0);
  return {
    stops,
    per_trip_litres: perTrip,
    total_people: stops.reduce((s, x) => s + x.people_served, 0),
    total_litres: stops.reduce((s, x) => s + x.litres, 0),
    no_access_people: noAccessPeople,
    unmet_people: Math.max(0, noAccessPeople - servedNoAccess),
  };
}

export function earlyWarningTiers(rows: NeedRow[]) {
  const byNeed = [...rows].sort((a, b) => b.need_points - a.need_points || b.people - a.people || a.cluster_id.localeCompare(b.cluster_id));
  const top = new Set(byNeed.slice(0, Math.ceil(TIER1_TOP_SHARE * rows.length)).map((r) => r.cluster_id));
  const isT1 = (r: NeedRow) => r.no_safe_access || r.vulnerable_est > 0 || top.has(r.cluster_id);
  const tier1 = rows.filter(isT1);
  const tier2 = rows.filter((r) => !isT1(r));
  const tier1Barangays = [...new Set(tier1.map((r) => r.barangay_id))];
  const t1 = new Set(tier1Barangays);
  const tier2Barangays = [...new Set(tier2.map((r) => r.barangay_id))].filter((b) => !t1.has(b));
  return { tier1, tier2, tier1Barangays, tier2Barangays };
}

export interface GapSite {
  cluster_id: string; label: string; lat: number; lng: number; gained_people: number; covered_cluster_ids: string[];
}

export function accessGapSites(rows: NeedRow[], clusters: Cluster[], k = 3) {
  const gap = new Map(rows.map((r) => [r.cluster_id, r.no_safe_access ? r.people : 0]));
  const sites: GapSite[] = greedyCover(clusters, gap, k).map((p) => ({
    cluster_id: p.cluster.cluster_id, label: p.cluster.label, lat: p.cluster.lat, lng: p.cluster.lng,
    gained_people: p.gain, covered_cluster_ids: p.covered,
  }));
  return { sites, total_gap_people: [...gap.values()].reduce((s, n) => s + n, 0) };
}

/** Distinct safe sources with a known location: the "no safe water within 30 min" test rests on these. */
export function countSafeMappedSources(sources: ScoreInput["sources"]): number {
  const seen = new Set<string>();
  for (const s of sources) {
    if (!s.active || s.safety_score < SAFE_SOURCE_MIN_SCORE || s.lat === null || s.lng === null) continue;
    seen.add(`${s.lat.toFixed(5)},${s.lng.toFixed(5)}`);
  }
  return seen.size;
}
