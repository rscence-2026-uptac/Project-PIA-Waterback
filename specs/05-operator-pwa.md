# Spec: Operator + resident/captain PWA shell

## What it does
The client shell: an operator dashboard for logging turbidity/plant-status/reservoir readings, and a resident/barangay-captain PWA for checking barangay status — both installable and offline-first, queuing writes locally (Dexie.js/IndexedDB) and syncing when connectivity returns.

## Data contract
```ts
import { z } from "zod";

export const OperatorReadingForm = z.object({
  barangay_id: z.string(),
  turbidity_ntu: z.number().nonnegative(),
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100),
  clarifier_inflow_lps: z.number().nonnegative(),
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

## Depends on
- specs/00-data-model.md
- specs/08-ui-ux-guidelines.md
