-- Run after all seeds (spec 01). Read-only assertions.
do $$ begin
  assert (select count(*) from barangays) = 57, 'barangays = 57 (Catbalogan)';
  assert (select count(*) from barangays where service_level <> 'unserved') = 26, '26 served';
  assert (select count(*) from barangays where service_level = 'unserved') = 31, '31 unserved';
  assert (select count(*) from barangays where service_level = 'level_i') = 4, '4 level_i';
  assert (select count(*) from barangays where service_level = 'unserved'
          and (zone is not null or piped_households is not null or unpiped_households is not null or lat is not null)) = 0, 'unserved rows carry no guessed data';
  assert (select count(*) from barangays where service_level = 'unserved' and coverage_source <> 'unknown') = 0, 'unserved coverage unknown';
  assert (select count(*) from barangays where barangay_id in ('canlapwas','munoz','guindapunan','bunu-anan','darahuway-guti','darahuway-dako','poblacion-05')) = 7, 'kept ids';
  assert (select name from barangays where barangay_id = 'poblacion-05') = 'Poblacion 5 (Barangay 5)', 'official name';
  assert (select name from barangays where barangay_id = 'canlapwas') = 'Canlapwas (Poblacion)', 'official name';
  assert (select name from barangays where barangay_id = 'munoz') = 'Muñoz (Poblacion 14)', 'official name';
  assert (select name from barangays where barangay_id = 'guindapunan') = 'Guindaponan', 'official name';
  assert (select name from barangays where barangay_id = 'bunu-anan') = 'Bunuanan', 'official name';
  assert (select name from barangays where barangay_id = 'darahuway-guti') = 'Darahuway Gote', 'official name';
  assert (select name from barangays where barangay_id = 'darahuway-dako') = 'Darahuway Daco', 'official name';
  assert (select wsp_name from barangays where barangay_id = 'darahuway-dako') = 'Darahuway Dako', 'wsp alias';
  assert (select wsp_name from barangays where barangay_id = 'guindapunan') = 'Guindapunan', 'wsp alias';
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
