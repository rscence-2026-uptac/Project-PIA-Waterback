// SPEC: 05 (amendment) — in-app walking directions to a backup source.
// Router: FOSSGIS's public OSRM "foot" server on OpenStreetMap data. Free, no API key, fair use only
// (owner OK 2026-10-06); production would self-host OSRM with the same API.
export const WALKING_ROUTER_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
const ROUTE_TIMEOUT_MS = 12_000;

export type Point = { lat: number; lng: number };

export interface RouteStep {
  type: string; // OSRM maneuver type: depart, turn, continue, new name, end of road, fork, roundabout, arrive…
  modifier: string | null; // left, right, slight left, sharp right, straight, uturn
  road: string | null; // street name; null when OpenStreetMap has none
  metres: number;
}

export interface WalkingRoute {
  metres: number;
  minutes: number;
  path: [number, number][]; // [lat, lng] for Leaflet
  steps: RouteStep[];
}

interface OsrmStep {
  name: string;
  distance: number;
  maneuver: { type: string; modifier?: string };
}

export async function fetchWalkingRoute(from: Point, to: Point): Promise<WalkingRoute> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    // OSRM takes lng,lat pairs.
    const url = `${WALKING_ROUTER_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`router HTTP ${res.status}`);
    const data = await res.json();
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) throw new Error(`router ${data.code}`);
    return {
      metres: route.distance,
      minutes: route.duration / 60,
      path: (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
      steps: (route.legs[0].steps as OsrmStep[]).map((s) => ({
        type: s.maneuver.type,
        modifier: s.maneuver.modifier ?? null,
        road: s.name ? s.name : null,
        metres: s.distance,
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}
