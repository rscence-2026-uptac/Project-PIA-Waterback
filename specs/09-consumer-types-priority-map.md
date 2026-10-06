# 09 — Consumer types and priority map

- **Status:** superseded (ranking) by spec 10 on 2026-10-07; the map and list UI are reused there
- **Owner:** Dev B
- **Reviewed by:** owner; Dev A pending (backend asks in `docs/dev-b-handoff.md` #10)
- **Depends on:** 03 (affected barangays), 06 (allocation screen, `AllocationDecision`), 08 (UI rules), seed `barangays.sql` lat/lng
- **Covers (SPEC.md IDs):** ACT-4 (new), extends ACT-1

## 1. What it does

The LGU allocation screen (`/lgu`) stops counting only "households". Affected water users are split into four **consumer types**, ranked in this default order:

1. **LGU**: public and critical facilities (health stations, schools, evacuation centers, barangay/city halls)
2. **Residential**: homes
3. **Commercial**: shops, markets, refilling stations, restaurants
4. **Industrial**: plants and processing sites

The priority list has **one row per (barangay, type)** that has at least one affected connection, ranked together. The officer can still move any row up or down (human-in-the-loop, spec 06). Above the list, a **map** shows where each row is and who is first. Each affected barangay is a pin at its seed centroid. The pin carries that barangay's best rank and its top type, and the rank-1 row is called out on the map. Judging fit: functionality (the core ACT-1 decision is clearer), relevance (a utility judge thinks in CWD connection classes, not households), and UX (it shows where, not only who).

## 2. Data contract (in → out)

```ts
// apps/web/src/contracts/spec09.ts (app copy; shared-types once Dev A adds it)
import { z } from "zod";

// SPEC: 09. Order = default priority (index 0 served first).
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

// Map pin input: from the seed barangays table (approximate OSM centroids, not survey data).
export const BarangayPoint = z.object({
  barangay_id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});

// spec 06 AllocationDecision gains one optional field (additive; old payloads still parse):
//   consumer_type: ConsumerType.optional()  // which group of the barangay this rank is for
```

**Suggested rank (heuristic, not a CWD rule):** sort by type order (`lgu`, `residential`, `commercial`, `industrial`), then by the barangay's spec 03 suggested order. Ties go to `barangay_id` ascending.

**Map pin for a barangay:** its best (lowest) current rank among its rows, and the type of that row. When the officer reorders, pins update immediately.

## 3. Acceptance criteria

Checked against the `// MOCK:` groups in `apps/web/src/data/mockLgu.ts`. These are the six seed barangays: Canlapwas, Mercedes, San Andres, Guinsorongan, Payao, Maulong.

- [ ] The word "household(s)" no longer appears on `/lgu`. Counts read "{n} connections" or "{n} facilities" for LGU rows. A null count reads "coverage unknown".
- [ ] The priority list shows one row per (barangay, type) with connections > 0 or unknown. Each row shows a type badge with **icon, text and colour** (never colour alone).
- [ ] The default order puts every LGU row above every Residential row, Residential above Commercial, and Commercial above Industrial. Row 1 is `Canlapwas · LGU`.
- [ ] Moving a row with the up/down buttons changes its rank. The "moved from N" tag and the `changes` count behave as in spec 06. The confirmed `AllocationDecision[]` has one entry per row, with `consumer_type` set.
- [ ] A Leaflet map (standard OpenStreetMap tiles in their normal colours, no API key) sits above the priority list. It opens centred on Catbalogan at city zoom, and panning stays near the city. It shows one pin per affected barangay at its seed lat/lng, named on the map, with each name placed on its least crowded side. The pin label is its best rank, and the pin style is its top type. A halo around each pin is sized by its known non-LGU connections; unknown coverage draws a dashed halo.
- [ ] The rank-1 pin is larger and ripples (no ripple under reduced motion). A "served first" card on the map names the rank-1 row with "Highest priority", its type, count and needs. After a reorder that changes row 1, the card and the ripple move to the new rank-1 barangay.
- [ ] A ranked strip along the bottom of the map lists each barangay by its best rank. Pointing at a strip button, pin or list row highlights the same barangay in all three.
- [ ] Zoom in, zoom out and "Back to Catbalogan" buttons work, with keyboard focus rings.
- [ ] A legend under the map lists the four types in priority order (icon + text + colour) and says "1 = served first".
- [ ] Clicking a pin scrolls to and highlights that barangay's first row in the list (keyboard: pins are focusable, Enter does the same).
- [ ] Offline or tile failure: the pins and legend still render on a plain background, and a line says "Map tiles need internet. Pins are still accurate." The page never breaks.
- [ ] OpenStreetMap attribution is shown on the map, as the tile licence requires.
- [ ] The summary card and the "Who is affected" panel show totals per type instead of households.
- [ ] The map respects reduced motion: no fly or zoom animation.

## 4. Out of scope (for the 24 hours)

- Real per-type connection counts from CWD billing data (mock until Dev A supplies them; handoff #10)
- Barangay boundary polygons (pins at centroids only)
- Resident, captain and operator screens (unchanged); resident onboarding does not ask for a consumer type
- Event record (`/lgu/event`) and live dashboard (`/lgu/live`) wording (still say households; follow-up)
- Routing trucks by type, or per-type notifications

## Decisions

- 2026-10-06: Owner chose (barangay, type) rows, LGU > Residential > Commercial > Industrial, and Leaflet + OSM tiles. Owner approved installing `leaflet`, `react-leaflet` and `@types/leaflet` (Hard rule 3). Owner locked the spec ahead of Dev A's review; Dev A's asks are logged in the handoff.
- 2026-10-06: Map refined into a "command map" (owner chose the direction): basemap, type-coloured beacons with connection halos, served-first card, ranked strip, linked hover, custom controls.
- 2026-10-06: CARTO tiles now watermark "API key required" in the browser, so the map uses standard OpenStreetMap tiles (no key; OSM tile policy: light use, attribution). It opens on Catbalogan (centre = OPEN_METEO_LAT/LON).
- Two new colour tokens for the type badges (`--color-amber` for Commercial, `--color-plum` for Industrial). LGU uses `coral-deep` and Residential uses `water`. These are recorded in DESIGN.md.

## Definition of Ready (check before locking)

- [x] Data contract is typed
- [x] Acceptance criteria are testable bullets
- [x] Dependencies are named
- [ ] Other dev has read and okayed it → locked on owner OK, Dev A pending

## Definition of Done (check before marking done)

- [ ] Passes its own acceptance criteria against the seed data
- [ ] Deployed to the dev URL (not just running locally)
- [ ] Demoed live to the other dev in under two minutes
