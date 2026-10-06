-- Spec 02 v2: the turbidity model uses forecast_rain_48h_mm. For a deterministic, offline-safe demo we store
-- the hourly forecast (Open-Meteo historical-forecast archive) in a table; the function falls back to a live
-- forecast only for as_of within ~3 h of now.
create table rain_forecast_hourly (
  ts timestamptz primary key,
  precipitation_mm numeric not null check (precipitation_mm >= 0),
  source text not null default 'open-meteo-historical-forecast',
  fetched_at timestamptz default now()
);
alter table rain_forecast_hourly enable row level security;
create policy rain_forecast_hourly_select_all on rain_forecast_hourly for select to anon, authenticated using (true);
