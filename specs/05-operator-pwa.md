# Spec: Operator + resident/captain PWA shell

## What it does
The client shell: an operator dashboard for logging per-intake turbidity/plant-status/reservoir readings, and a resident/barangay-captain PWA for checking barangay status — both installable and offline-first, queuing writes locally (Dexie.js/IndexedDB) and syncing when connectivity returns.

## Data contract
```ts
import { z } from "zod";

export const OperatorReadingForm = z.object({
  intake_id: z.enum(["kulador", "masacpasac", "caramayon_1", "caramayon_2"]), // operator picks Kulador, Masacpasac, Caramayon I or Caramayon II
  turbidity_ntu: z.number().nonnegative(),
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100).nullable(),
  clarifier_inflow_lps: z.number().nonnegative().nullable(),
});

export const OfflineQueueItem = z.object({
  local_id: z.string().uuid(), // client-generated, idempotency key on sync
  kind: z.enum(["reading", "resident_confirmation"]),
  payload: z.record(z.unknown()),
  queued_at: z.string().datetime(),
  synced: z.boolean().default(false),
});

export const BarangayStatusView = z.object({
  barangay_id: z.string(),
  signal_level: z.number().int().min(0).max(4),
  last_synced_at: z.string().datetime(),
  is_stale: z.boolean(), // true when served from cache, not a fresh fetch
});
```

## Acceptance criteria
- [ ] Operator can submit a reading while offline; it queues locally in `OfflineQueueItem` form and syncs automatically on reconnect with no data loss — tested via an airplane-mode toggle
- [ ] Resident/captain view loads and shows last-known barangay status from cache when offline, with a visible `last_synced_at` timestamp — never a blank screen or infinite spinner
- [ ] PWA installs on both Android Chrome and desktop Chrome (manifest + service worker pass Lighthouse's installability check)
- [ ] All copy pulls from `08-ui-ux-guidelines.md`'s trilingual string table — no hardcoded inline text

## Out of scope
- Native iOS/Android app wrapper
- Push notifications beyond what the PWA/browser natively supports
- Multi-operator conflict resolution (last write wins is acceptable for the demo)

## Amendment 2026-10-06: backup sources map (owner OK)

The resident Sources screen (`/sources`) gets a map of the barangay's backup water, so a resident can see where the nearest source is. Owner chose: real seed sources, barangay centre with optional GPS, map always shown.

- Sources come from Dev A's seed (`supabase/seed/sources.sql`, copied to `apps/web/src/data/seedSources.ts`), ranked in the app the way spec 04's `rankSources` does (inactive out, neighbouring barangay out on turbidity/drought, then safety, travel, cost) until the app reads `RankedChain` from the API.
- Placeholder rows (`is_simulated`) keep the "Sample entry · not yet checked" label. Rows without coordinates (simulated truck stops, neighbour supply) stay in the list but get no pin; never an invented one.

Acceptance criteria:
- [ ] The Sources screen always shows the map (Leaflet + standard OSM tiles) above the plan; Leaflet is a separate chunk loaded only by this screen.
- [ ] The map shows "Your barangay" at its seed centroid and one pin per source that has lat/lng, lettered like the plan (A, B, C); Plan A uses the primary colour.
- [ ] A card under the map names the nearest mapped source ("Plan B · nearest on the map"), its straight-line distance in words ("About 1.1 km away · in a straight line from the centre of your barangay"), and a full-width "Get walking directions" link that opens Google Maps.
- [ ] Tapping a pin selects that source: the card shows it and the list scrolls to and outlines its row.
- [ ] "Use my location" asks for GPS only when tapped; on success a "You are here" dot appears and distances are measured from it; on refusal or timeout a plain message says the map uses the barangay centre. No permission prompt on page load.
- [ ] Offline or tile failure: the map says "The map needs internet. The list below still works." The list is unaffected.
- [ ] Everything the map shows is also in words (card and list); the map itself is hidden from screen readers. No drag-to-pan on phones (it would trap page scroll); zoom buttons are 48 px.

Out of scope: walking routes or road distance in the app; live queue/stock status on real sources (needs captain/partner reports); offline map tiles.

## Depends on
- specs/00-data-model.md
- specs/08-ui-ux-guidelines.md

## Changelog
- 2026-10-06: amendment, backup sources map on /sources (Dev B, owner OK)
- 2026-10-06: readings logged per intake, aligned with CWD 2022 WSP (docs/wsp_findings.md)
