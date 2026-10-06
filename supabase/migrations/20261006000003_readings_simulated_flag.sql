-- Spec 01: seed readings must be labeled simulated (never presented as CWD telemetry). Default false = real/sensor rows.
alter table readings add column is_simulated boolean not null default false;
