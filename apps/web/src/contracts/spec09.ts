// SPEC: 09-consumer-types-priority-map.md — copied from the spec; moves to shared-types once Dev A adds it.
import { z } from "zod";

// Order = default priority (index 0 served first). Heuristic, not a CWD rule (spec 09).
export const CONSUMER_TYPES = ["lgu", "residential", "commercial", "industrial"] as const;
export const ConsumerType = z.enum(CONSUMER_TYPES);
export type ConsumerType = z.infer<typeof ConsumerType>;

// One affected (barangay, type) group: a row on the priority list.
export const AffectedGroup = z.object({
  barangay_id: z.string(),
  consumer_type: ConsumerType,
  connections_affected: z.number().int().nonnegative().nullable(), // null = unknown, never guessed (spec 03 rule)
  coverage_confidence: z.enum(["confirmed", "estimate", "unknown"]),
  facilities: z.array(z.enum(["health_station", "school", "evacuation_center", "barangay_hall"])), // lgu rows only, else []
  vulnerable_residents: z.number().int().nonnegative(), // residential rows only, else 0
  no_backup_connections: z.number().int().nonnegative(), // no safe source within the 30-min JMP benchmark
  suggested_rank: z.number().int().positive(),
});
export type AffectedGroup = z.infer<typeof AffectedGroup>;

// Map opening view. Centre = OPEN_METEO_LAT/LON in .env.example (approx. Catbalogan city proper);
// zoom 13 shows about 6 km north-south in the 440px map, enough for the six sample barangays (~5 km apart).
export const CATBALOGAN_CENTER: [number, number] = [11.7769, 124.8852];
export const CATBALOGAN_ZOOM = 13;
// Panning stays near the city: approx. city extent incl. upland barangays, padded (not a legal boundary).
export const CATBALOGAN_BOUNDS: [[number, number], [number, number]] = [[11.62, 124.76], [11.92, 125.03]];

// Map pin: seed barangays table (approximate OSM centroids, not survey data).
export const BarangayPoint = z.object({
  barangay_id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type BarangayPoint = z.infer<typeof BarangayPoint>;
