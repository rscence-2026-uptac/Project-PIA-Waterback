-- Simulated handset (zero-cost SMS demo). Every SMS the backend sends or would send (dry_run) and every inbound reply is
-- logged here so a phone mockup can show it live through Realtime. Table count: fourteen (13 core + sms_outbox).
-- PRIVACY: world-readable with the anon key by design, so it NEVER holds a full phone number: `to_masked` only
-- (e.g. +63900•••0001: first 6 chars + last 4 digits). `residents` stays service_role only.
-- Writes: service_role only (Edge Functions); there are no insert/update/delete policies.
create table sms_outbox (
  id uuid primary key default gen_random_uuid(),
  disruption_id uuid references disruptions(id) on delete set null,
  barangay_id text references barangays(barangay_id),
  resident_id uuid references residents(id) on delete set null,
  to_masked text not null,   -- masked counterpart number (recipient for outbound, sender for inbound). Never the full number.
  template text,             -- SmsKey, e.g. 'sms.water_off'; null for inbound
  language text,             -- waray | filipino | english
  body text not null,
  direction text not null check (direction in ('outbound', 'inbound')),
  mode text not null check (mode in ('dry_run', 'live')),
  created_at timestamptz not null default now()
);
create index sms_outbox_created_idx on sms_outbox (created_at desc);

alter table sms_outbox enable row level security;
create policy sms_outbox_select_all on sms_outbox for select to anon, authenticated using (true);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sms_outbox;
  end if;
end $$;
