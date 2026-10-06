-- Spec 00: align with CWD 2022 WSP (docs/wsp_findings.md). Adds intakes; readings are per intake, not per barangay.
-- Eleven tables after this migration. Remote readings table is empty, so drop/add is safe.

create type intake_type_t   as enum ('surface', 'spring', 'deep_well');
create type service_level_t as enum ('level_iii', 'level_i', 'unserved');

create table intakes (
  intake_id text primary key,
  name text not null,
  type intake_type_t not null,
  rated_capacity_lps numeric check (rated_capacity_lps >= 0), -- null = not stated in WSP
  treated_at_kulador boolean not null,
  power_dependent boolean not null,
  wsp_page text not null
);
alter table intakes enable row level security;
create policy intakes_select_all on intakes for select to anon, authenticated using (true);

-- barangays: zone + service level; unknown values are NULL, never guessed
alter table barangays
  add column zone smallint check (zone between 1 and 10),
  add column service_level service_level_t not null default 'level_iii',
  alter column piped_households drop not null,
  alter column unpiped_households drop not null,
  alter column lat drop not null,
  alter column lng drop not null;

-- readings: per intake; reservoir/clarifier only on Kulador rows
drop index readings_barangay_recorded_idx;
alter table readings drop column barangay_id;
alter table readings add column intake_id text not null references intakes(intake_id);
alter table readings
  alter column reservoir_pct drop not null,
  alter column clarifier_inflow_lps drop not null;
create index readings_intake_recorded_idx on readings (intake_id, recorded_at desc);
