-- sms_outbox (simulated handset) + demo residents. Run after migrations + seeds. Rolled back at the end.
begin;
do $$ begin
  assert (select count(*) from residents where display_name like 'Demo resident %') = 5, 'demo residents = 5';
  assert (select count(*) from residents where phone ~ '^\+63900000000[0-9]$') = 4, '4 demo sms residents in the fake block';
  assert (select count(*) from residents where display_name like 'Demo resident %' and channel = 'pwa') = 1, 'one pwa demo resident';
  assert (select count(*) from residents where display_name like 'Demo resident %' and channel = 'sms' and phone is not null) = 4, 'sms demo residents have phones';
  assert (select count(distinct preferred_language) from residents where display_name like 'Demo resident %') = 3, 'language mix';
  assert (select count(*) from residents r join barangays b using (barangay_id)
          where r.display_name like 'Demo resident %' and r.barangay_id in
          ('darahuway-dako','darahuway-guti','lagundi','payao','poblacion-01')) = 5, 'demo residents in the demo barangays';
  assert (select count(*) from residents where phone is not null and phone !~ '^\+639[0-9]{9}$') = 0, 'phones valid';
  assert exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='sms_outbox'), 'sms_outbox in realtime';
  assert (select relrowsecurity from pg_class where relname = 'sms_outbox'), 'sms_outbox RLS on';
end $$;

-- re-running the seed is idempotent
\i supabase/seed/demo_residents.sql
do $$ begin
  assert (select count(*) from residents where display_name like 'Demo resident %') = 5, 'demo seed is re-runnable';
end $$;

set local role service_role;
insert into sms_outbox (barangay_id, resident_id, to_masked, template, language, body, direction, mode)
  select barangay_id, id, '+63900•••0001', 'sms.water_off', 'waray', 'PIA WATERBACK: test', 'outbound', 'dry_run'
  from residents where phone = '+639000000001';
insert into sms_outbox (to_masked, body, direction, mode) values ('+63900•••0001', 'THANKS', 'inbound', 'dry_run');
reset role;

set local role anon;
do $$ begin
  assert (select count(*) from sms_outbox) = 2, 'anon can read sms_outbox';
  begin
    insert into sms_outbox (to_masked, body, direction, mode) values ('x', 'y', 'outbound', 'dry_run');
    raise exception 'anon insert into sms_outbox succeeded';
  exception when insufficient_privilege then null;
  end;
  update sms_outbox set body = 'x'; assert not found, 'anon update affected rows';
  delete from sms_outbox; assert not found, 'anon delete affected rows';
  assert (select count(*) from residents) = 0, 'anon still cannot read residents';
end $$;
reset role;
set local role authenticated;
do $$ begin
  assert (select count(*) from sms_outbox) = 2, 'authenticated can read sms_outbox';
end $$;
reset role;

-- constraints
do $$ begin
  begin insert into sms_outbox (to_masked, body, direction, mode) values ('x','y','sideways','dry_run'); raise exception 'bad direction accepted';
  exception when check_violation then null; end;
  begin insert into sms_outbox (to_masked, body, direction, mode) values ('x','y','inbound','maybe'); raise exception 'bad mode accepted';
  exception when check_violation then null; end;
  -- the outbox only ever holds masked numbers: no 10+ digit run anywhere
  assert (select count(*) from sms_outbox where to_masked ~ '[0-9]{7}' or body ~ '\+?63[0-9]{10}') = 0, 'unmasked number in sms_outbox';
end $$;
select 'SMS OUTBOX OK' as result;
rollback;
