// SPEC: 10 — inputs for the need score: clusters (generated offline) plus vulnerable counts and facilities.
import clustersJson from "./clusters.generated.json";
import { AFFECTED, type Facility } from "./mockLgu";
import type { Cluster } from "../contracts/spec10";

export interface ClustersFile {
  generated_at: string;
  sources: { worldpop: string; psa: string; psa_accessed: string; note: string };
  barangays: {
    barangay_id: string; name: string; served: boolean;
    service_level: "level_iii" | "level_i" | "unserved";
    psa_2020: number | null; grid_people: number; cells: number; clusters: number;
  }[];
  clusters: Cluster[];
  missing_psa: string[];
}

export const clustersFile = clustersJson as ClustersFile;

// MOCK: vulnerable residents and critical facilities exist only for the 6 mock affected barangays (mockLgu.ts AFFECTED);
// every other barangay is 0 / []. Real values: residents.is_vulnerable and barangays.critical_facilities once the DB is
// wired (spec 10, handoff #12).
export const VULNERABLE_BY_BARANGAY: Record<string, number> = Object.fromEntries(
  AFFECTED.map((a) => [a.barangay_id, a.vulnerable_households]),
);
export const FACILITIES_BY_BARANGAY: Record<string, Facility[]> = Object.fromEntries(
  AFFECTED.map((a) => [a.barangay_id, a.facilities]),
);
