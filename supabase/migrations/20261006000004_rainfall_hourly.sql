-- Spec 02: the predictor's rain_24h / rain_72h features need hourly rainfall (rainfall_daily is too coarse).
create table rainfall_hourly (
  ts timestamptz primary key,
  precipitation_mm numeric not null check (precipitation_mm >= 0),
  source text not null default 'open-meteo'
);
alter table rainfall_hourly enable row level security;
create policy rainfall_hourly_select_all on rainfall_hourly for select to anon, authenticated using (true);
