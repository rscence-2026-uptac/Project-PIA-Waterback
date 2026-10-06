-- Dev B handoff 2026-10-06 (docs/dev-b-handoff.md items 2, 2a, 3, 9). Columns only: table count unchanged (thirteen).

-- readings: treated turbidity (Kulador only; compared against TURBIDITY_LIMIT_NTU) + offline-queue idempotency key
alter table readings
  add column treated_turbidity_ntu numeric check (treated_turbidity_ntu >= 0),
  add column client_local_id text unique; -- Dev B's offline-queue local_id; NULL for server-originated rows

-- event_log: barangay_id NULL = system-wide event (predicted/confirmed); the dashboard fans it out to served barangays
alter table event_log
  add column barangay_id text references barangays(barangay_id),
  add column client_local_id text unique; -- idempotency for resident confirmations replayed from the offline queue
create index event_log_barangay_occurred_idx on event_log (barangay_id, occurred_at desc);

-- disruptions: status-screen timing fields. Per-barangay "restored at" = the resident_confirmed event with
-- payload_json.restored = true (no column); disruption-level restored = resolved_at (spec 00).
alter table disruptions
  add column window_start timestamptz,
  add column window_end timestamptz,
  add column likely_at timestamptz,
  add column next_update_at timestamptz,
  add column heads_up_from timestamptz;

-- barangays: name = official PSA PSGC name; wsp_name = CWD WSP spelling where it differs (search alias)
alter table barangays add column wsp_name text;
