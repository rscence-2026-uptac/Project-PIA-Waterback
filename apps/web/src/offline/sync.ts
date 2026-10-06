// SPEC: 05 — sync seam. Waiting on Dev A's Supabase (spec 00).
//
// TODO(Dev A backend): when the `readings` table and the anon/service keys exist,
// add a `syncQueue()` here that:
//   1. reads pendingItems() in queued_at order,
//   2. upserts each payload using local_id as the idempotency key,
//   3. sets synced = true only after the server confirms,
//   4. runs on the window "online" event and on app start.
// Until then nothing is marked synced, so queued readings stay safely on the device.
export {};
