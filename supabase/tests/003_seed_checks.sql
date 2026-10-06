-- Run after all seeds (spec 01). Read-only assertions.
do $$ begin
  assert (select count(*) from readings) = 2976, 'readings = 31*24*4';
  assert (select count(*) from readings where not is_simulated) = 0, 'all seeded readings flagged simulated';
  assert (select count(*) from rainfall_daily) = 61, 'rainfall_daily = 30 June + 31 July';
  assert (select count(*) from rainfall_hourly) = 1464, 'rainfall_hourly = (30+31)*24';
  assert (select count(*) from rainfall_hourly where ts >= '2026-06-01+08' and ts < '2026-07-01+08') = 720, 'June context hourly = 30*24';
  assert (select count(*) from rainfall_hourly where ts >= '2026-07-01+08' and ts < '2026-08-01+08') = 744, 'July hourly = 31*24';
  assert (select count(*) from rainfall_daily where date < '2026-07-01') = 30, 'June context daily = 30';
  assert (select count(*) from rain_forecast_hourly) = 1464, 'rain_forecast_hourly = 61*24';
  assert (select min(ts) from rain_forecast_hourly) = '2026-06-01 00:00+08' and (select max(ts) from rain_forecast_hourly) = '2026-07-31 23:00+08', 'forecast range';
  assert (select count(*) from readings where plant_status = 'shutdown'
          and recorded_at >= '2026-07-02+08' and recorded_at < '2026-07-08+08') >= 1, 'shutdown row in crisis window';
  assert (select count(*) from readings where intake_id = 'caramayon_1' and turbidity_ntu >= 500
          and plant_status = 'shutdown' and recorded_at >= '2026-07-02+08' and recorded_at < '2026-07-08+08') >= 1, 'caramayon_1 >= 500 NTU shutdown';
  assert (select count(*) from readings where intake_id <> 'kulador' and (reservoir_pct is not null or clarifier_inflow_lps is not null)) = 0, 'kulador-only fields';
end $$;
select 'SEED CHECKS OK' as result;
