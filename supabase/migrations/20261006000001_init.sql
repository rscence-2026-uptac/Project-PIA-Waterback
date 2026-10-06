-- Spec 00: data model. Ten tables. PostGIS intentionally NOT used (barangay centroid lat/lng only, spec 03).
-- Filename note: spec says 001_init.sql; Supabase CLI only applies <timestamp>_name.sql, so adapted.

-- ---------- enums (match Zod enums exactly) ----------
create type coverage_source_t as enum ('cwd_service_map', 'estimate', 'unknown');
create type plant_status_t    as enum ('normal', 'degraded', 'shutdown');
create type reading_source_t  as enum ('operator', 'sensor');
create type disruption_cause_t  as enum ('turbidity', 'drought', 'repair');
create type disruption_status_t as enum ('predicted', 'confirmed', 'deployed', 'notified', 'resolved');
create type source_type_t as enum ('piped', 'refill_station', 'trucking', 'communal_tap', 'neighboring_barangay');
-- order matters: matches the process-flow diagram
create type language_t as enum ('waray', 'filipino', 'english');
create type channel_t   as enum ('pwa', 'sms');
create type event_type_t as enum ('predicted', 'confirmed', 'deployed', 'notified', 'resident_confirmed', 'resolved');

-- ---------- tables ----------
-- Hierarchy: LGU (implicit, single) -> barangays -> residents
create table barangays (
  barangay_id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  piped_households int not null check (piped_households >= 0),
  unpiped_households int not null check (unpiped_households >= 0),
  coverage_source coverage_source_t not null,
  critical_facilities text[] not null default '{}'
    check (critical_facilities <@ array['health_station','school','evacuation_center']::text[])
);

create table residents (
  id uuid primary key default gen_random_uuid(),
  barangay_id text not null references barangays(barangay_id),
  display_name text,
  phone text check (phone ~ '^\+639[0-9]{9}$'), -- PH mobile, E.164. PII
  preferred_language language_t not null default 'waray',
  channel channel_t not null,
  is_vulnerable boolean not null default false, -- elderly/PWD household
  created_at timestamptz not null default now()
);
create index residents_barangay_idx on residents (barangay_id);

create table wsp_constants (
  key text primary key,
  value numeric not null,
  unit text not null,
  source text not null
);

create table rainfall_daily (
  date date primary key,
  precipitation_mm numeric not null check (precipitation_mm >= 0),
  source text not null default 'open-meteo',
  fetched_at timestamptz default now()
);

create table readings (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null,
  barangay_id text not null references barangays(barangay_id),
  turbidity_ntu numeric not null check (turbidity_ntu >= 0),
  plant_status plant_status_t not null,
  reservoir_pct numeric not null check (reservoir_pct between 0 and 100),
  clarifier_inflow_lps numeric not null check (clarifier_inflow_lps >= 0),
  source reading_source_t not null
);
create index readings_barangay_recorded_idx on readings (barangay_id, recorded_at desc);

create table disruptions (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  resolved_at timestamptz,
  cause disruption_cause_t not null,
  p_turbidity numeric check (p_turbidity between 0 and 1),
  p_drought numeric check (p_drought between 0 and 1),
  signal_level int not null check (signal_level between 0 and 4),
  status disruption_status_t not null
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  barangay_id text not null references barangays(barangay_id),
  name text not null,
  type source_type_t not null,
  safety_score numeric not null check (safety_score between 0 and 1),
  travel_minutes numeric not null check (travel_minutes >= 0),
  cost_php_per_unit numeric not null check (cost_php_per_unit >= 0),
  active boolean not null default true
);
create index sources_barangay_idx on sources (barangay_id);

create table continuity_chains (
  id uuid primary key default gen_random_uuid(),
  barangay_id text not null references barangays(barangay_id),
  disruption_id uuid not null references disruptions(id),
  ranked_source_ids uuid[] not null default '{}', -- ordered safety desc, time asc, cost asc
  computed_at timestamptz not null default now()
);
create index continuity_chains_disruption_idx on continuity_chains (disruption_id, barangay_id);

create table allocations (
  id uuid primary key default gen_random_uuid(),
  disruption_id uuid not null references disruptions(id),
  barangay_id text not null references barangays(barangay_id),
  priority_rank int not null check (priority_rank > 0),
  officer_id text not null, -- Supabase Auth user id; LGU seed accounts created separately
  decided_at timestamptz not null default now(),
  note text
);
create index allocations_disruption_idx on allocations (disruption_id);

create table event_log (
  id uuid primary key default gen_random_uuid(),
  disruption_id uuid not null references disruptions(id),
  event_type event_type_t not null,
  actor text not null, -- user id or 'system'
  occurred_at timestamptz not null default now(),
  payload_json jsonb
);
create index event_log_disruption_occurred_idx on event_log (disruption_id, occurred_at);

-- ---------- RLS ----------
-- HACKATHON-SCOPE DECISION, NOT A PRODUCTION SECURITY POSTURE:
-- all data except `residents` is world-readable via the anon key for demo simplicity;
-- there are NO insert/update/delete policies, so writes are only possible with service_role
-- (Edge Functions), which bypasses RLS.
-- EXCEPTION: `residents` holds phone numbers (PII): RLS enabled, NO policy for anon/authenticated,
-- so they see 0 rows (service_role only). Do not add a select policy.
do $$
declare t text;
begin
  foreach t in array array['barangays','wsp_constants','rainfall_daily','readings','disruptions',
                           'sources','continuity_chains','allocations','event_log','residents']
  loop
    execute format('alter table public.%I enable row level security', t);
    if t = 'residents' then continue; end if;
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   t || '_select_all', t);
  end loop;
end $$;

-- ---------- realtime (spec 07) ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['disruptions','allocations','event_log']
    loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end $$;
