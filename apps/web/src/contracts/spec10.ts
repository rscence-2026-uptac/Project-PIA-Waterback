// SPEC: 10-need-based-priority.md — copied from the spec; moves to shared-types once Dev A adopts it.
// Every weight below is a heuristic in "people-equivalents", not a standard. Change them here only.
import { z } from "zod";

export const Cluster = z.object({
  cluster_id: z.string(), // "<barangay_id>-c<n>"
  barangay_id: z.string(),
  label: z.string(), // "Mercedes · north part"; a barangay with one cluster is just its name
  lat: z.number(),
  lng: z.number(), // population-weighted centre
  people: z.number().int().nonnegative(), // PSA 2020 barangay total × this cluster's share of the WorldPop grid
  people_source: z.literal("psa2020_x_worldpop2020"),
});
export type Cluster = z.infer<typeof Cluster>;

export const NeedRow = z.object({
  cluster_id: z.string(),
  barangay_id: z.string(),
  label: z.string(),
  people: z.number().int().nonnegative(),
  vulnerable_est: z.number().nonnegative(), // barangay vulnerable count × people share (estimate)
  has_critical_facility: z.boolean(), // barangay facility, credited to its most populous cluster
  nearest_safe_min: z.number().nonnegative().nullable(), // round trip to nearest safe source with coordinates; null = none known
  no_safe_access: z.boolean(), // nearest_safe_min > 30 or null, or barangay Level I / unserved
  hours_dry: z.number().nonnegative(),
  need_points: z.number().nonnegative(),
  reasons: z.array(z.string()), // human-readable, in order of weight
  suggested_rank: z.number().int().positive(),
});
export type NeedRow = z.infer<typeof NeedRow>;

// Need score weights (spec 10 §2).
export const NO_ACCESS_WEIGHT = 1; // a person with no safe water within 30 min counts double
export const VULNERABLE_WEIGHT = 3; // an elderly/PWD/bedridden resident counts 3 extra
export const FACILITY_WEIGHT = 250; // a health station / evacuation centre serves many people
export const MAX_TIME_FACTOR = 2; // a day without water doubles urgency, then caps

// A source counts as safe drinking water at this score (spec 04 seed: refill stations 0.9, chlorinated trucks 0.8).
export const SAFE_SOURCE_MIN_SCORE = 0.8;

// Walking model from Dev A's source rubric (docs/backup_sources.md): straight line × 1.3 detour at 4 km/h.
export const WALK_DETOUR = 1.3;
export const WALK_KMH = 4;
// Farthest a drop point can be and still be inside the 30-min JMP round trip: 15 min one way.
export const TRUCK_WALK_RADIUS_M = Math.round(((15 / 60) * WALK_KMH * 1000) / WALK_DETOUR); // ≈ 769 m

// Daily drinking + cooking water per person, the app's storage rule (STORAGE.per_person_l in data/mock.ts).
export const LITRES_PER_PERSON_DAY = 15;

// Truck depot. MOCK: Catbalogan city hall area, approximated as the Poblacion centroid (supabase/seed/barangays.sql,
// poblacion-04); replace with the LGU/BFP motor pool once known.
export const DEPOT = { name: "City hall area (approx.)", lat: 11.7752359, lng: 124.880791 };

// LGU map opening view. Centre = OPEN_METEO_LAT/LON in .env.example (approx. Catbalogan city proper);
// zoom 13 shows about 6 km north-south in a 440 px map. Bounds keep panning near the city
// (approx. city extent incl. upland barangays, padded; not a legal boundary).
export const CATBALOGAN_CENTER: [number, number] = [11.7769, 124.8852];
export const CATBALOGAN_ZOOM = 13;
export const CATBALOGAN_BOUNDS: [[number, number], [number, number]] = [[11.62, 124.76], [11.92, 125.03]];

// Early warning: Tier 1 also takes the top quarter of clusters by need.
export const TIER1_TOP_SHARE = 0.25;
