-- Smoke test for 20261006000001_init.sql. Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/001_smoke.sql
-- Everything is rolled back at the end.
begin;

insert into barangays (barangay_id,name,lat,lng,piped_households,unpiped_households,coverage_source,critical_facilities)
  values ('p1','Brgy A',11.78,124.88,10,5,'estimate','{school}');
insert into barangays (barangay_id,name,coverage_source) values ('pnull','Unknown Brgy','unknown'); -- nullable lat/lng/households, zone
insert into residents (barangay_id,display_name,phone,preferred_language,channel,is_vulnerable)
  values ('p1','Test Resident','+639171234567','waray','sms',true);
insert into wsp_constants values ('TEST_KEY',1,'x','smoke');
insert into rainfall_daily (date, precipitation_mm) values ('2026-01-01', 1.5);
insert into readings (recorded_at,intake_id,turbidity_ntu,plant_status,reservoir_pct,clarifier_inflow_lps,source)
  values (now(),'kulador',3,'normal',50,40,'operator');
insert into readings (recorded_at,intake_id,turbidity_ntu,plant_status,source)
  values (now(),'masacpasac',2,'normal','operator'); -- NULL reservoir/clarifier is allowed
insert into disruptions (id,started_at,cause,p_turbidity,p_drought,signal_level,status)
  values ('00000000-0000-0000-0000-000000000001',now(),'turbidity',0.4,null,2,'predicted');
insert into sources (id,barangay_id,name,type,safety_score,travel_minutes,cost_php_per_unit,active)
  values ('00000000-0000-0000-0000-000000000002','p1','Tap','communal_tap',0.8,10,0,true);
insert into continuity_chains (barangay_id,disruption_id,ranked_source_ids)
  values ('p1','00000000-0000-0000-0000-000000000001','{00000000-0000-0000-0000-000000000002}');
insert into allocations (disruption_id,barangay_id,priority_rank,officer_id)
  values ('00000000-0000-0000-0000-000000000001','p1',1,'officer-1');
insert into event_log (disruption_id,event_type,actor,payload_json)
  values ('00000000-0000-0000-0000-000000000001','predicted','system','{"a":1}');

do $$
declare t text; n int;
begin
  foreach t in array array['intakes','barangays','residents','wsp_constants','rainfall_daily','rainfall_hourly','rain_forecast_hourly','readings','disruptions',
                           'sources','continuity_chains','allocations','event_log'] loop
    execute format('select count(*) from %I where true', t) into n;
    assert n >= 1, format('table %s empty', t);
  end loop;
  assert (select count(*) from intakes) = 4, 'intakes seeded count';
  assert (select count(*) from barangays) = 28, 'barangays = 26 seeded + 2 test rows';
  assert (select count(*) from barangays where barangay_id not in ('p1','pnull')) = 26, 'seeded barangays';
  assert (select count(*) from barangays where service_level = 'level_i') = 4, 'level_i count';
  assert (select count(*) from wsp_constants where key <> 'TEST_KEY') = 10, 'wsp_constants seeded count';
  assert (select count(*) from wsp_constants where key in ('turbidity_limit_ntu','turbidity_shutoff_ntu',
    'clarifier_capacity_cmd','clarifier_capacity_lps','reservoir_total_m3','reservoir_fire_reserve_m3',
    'reservoir_usable_m3','jmp_roundtrip_min','served_barangays','service_zones')) = 10, 'wsp_constants keys';
  assert (select array_agg(enumlabel::text order by enumsortorder) from pg_enum
          where enumtypid = 'event_type_t'::regtype)
       = array['predicted','confirmed','deployed','notified','resident_confirmed','resolved'],
       'event_type order';
  assert (select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'
          and relrowsecurity) = 13, 'RLS not enabled on 13 tables';
end $$;

-- constraint violations must fail
do $$ begin
  insert into readings (recorded_at,intake_id,turbidity_ntu,plant_status,reservoir_pct,clarifier_inflow_lps,source)
    values (now(),'kulador',3,'normal',101,40,'operator');
  raise exception 'reservoir_pct=101 was accepted';
exception when check_violation then null; end $$;

do $$ begin
  insert into disruptions (started_at,cause,signal_level,status) values (now(),'repair',5,'predicted');
  raise exception 'signal_level=5 was accepted';
exception when check_violation then null; end $$;

do $$ begin
  insert into allocations (disruption_id,barangay_id,priority_rank,officer_id)
    values ('00000000-0000-0000-0000-000000000001','p1',0,'o');
  raise exception 'priority_rank=0 was accepted';
exception when check_violation then null; end $$;

do $$ begin
  insert into readings (recorded_at,intake_id,turbidity_ntu,plant_status,reservoir_pct,clarifier_inflow_lps,source)
    values (now(),'nope',3,'normal',50,40,'operator');
  raise exception 'bad intake FK was accepted';
exception when foreign_key_violation then null; end $$;

do $$ begin
  insert into barangays (barangay_id,name,coverage_source,critical_facilities) values ('p2','n','unknown','{hospital}');
  raise exception 'bad facility accepted';
exception when check_violation then null; end $$;

do $$ begin
  insert into residents (barangay_id,phone,channel) values ('p1','09171234567','sms');
  raise exception 'phone without +63 was accepted';
exception when check_violation then null; end $$;

do $$ begin
  insert into residents (barangay_id,phone,channel) values ('nope','+639171234567','sms');
  raise exception 'bad resident barangay FK was accepted';
exception when foreign_key_violation then null; end $$;

do $$ begin
  assert (select preferred_language from residents limit 1) = 'waray', 'language default';
  insert into residents (barangay_id,channel) values ('p1','pwa'); -- phone and name are optional
end $$;

do $$ begin
  insert into barangays (barangay_id,name,coverage_source,zone) values ('z11','n','unknown',11);
  raise exception 'zone=11 was accepted';
exception when check_violation then null; end $$;

do $$ begin
  insert into barangays (barangay_id,name,coverage_source,service_level) values ('sl','n','unknown','level_ii');
  raise exception 'bad service_level was accepted';
exception when invalid_text_representation then null; end $$;

select 'SMOKE OK' as result;
rollback;
