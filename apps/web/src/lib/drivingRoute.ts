// SPEC: 10 — truck drive path through the drop points. Same pattern as walkingRoute.ts (spec 05), car profile.
// Router: FOSSGIS's public OSRM "car" server on OpenStreetMap data. Free, no API key, fair use only; production
// would self-host OSRM with the same API. Callers draw straight dashed lines when this throws.
export const DRIVING_ROUTER_URL = "https://routing.openstreetmap.de/routed-car/route/v1/driving";
const ROUTE_TIMEOUT_MS = 12_000;

export type Point = { lat: number; lng: number };

export interface DrivingRoute {
  metres: number;
  minutes: number;
  path: [number, number][]; // [lat, lng] for Leaflet
}

/** One route through `points` in order (depot first). */
export async function fetchDrivingRoute(points: Point[]): Promise<DrivingRoute> {
  if (points.length < 2) throw new Error("need at least two points");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    // OSRM takes lng,lat pairs.
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const res = await fetch(`${DRIVING_ROUTER_URL}/${coords}?overview=full&geometries=geojson`, { signal: controller.signal });
    if (!res.ok) throw new Error(`router HTTP ${res.status}`);
    const data = await res.json();
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) throw new Error(`router ${data.code}`);
    return {
      metres: route.distance,
      minutes: route.duration / 60,
      path: (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
    };
  } finally {
    clearTimeout(timer);
  }
}
