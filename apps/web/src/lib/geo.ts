// SPEC: 10 — shared geometry. Walking model constants live in contracts/spec10.ts.
import { WALK_DETOUR, WALK_KMH } from "../contracts/spec10.ts";

export type Point = { lat: number; lng: number };

/** Straight-line distance in metres (haversine). */
export function metresBetween(a: Point, b: Point) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Walking round trip in minutes for a straight-line distance (Dev A's rubric: 1.3 detour, 4 km/h). */
export function roundTripMinutes(metres: number) {
  return ((2 * (metres / 1000) * WALK_DETOUR) / WALK_KMH) * 60;
}
