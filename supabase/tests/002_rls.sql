-- RLS test. Run after migration + 000 stub. Rolled back at the end.
begin;
set local role service_role;
insert into barangays values ('rls1','n',0,0,1,1,'unknown','{}');
insert into residents (barangay_id,phone,channel) values ('rls1','+639171234567','sms');
do $$ begin
  insert into disruptions (started_at,cause,signal_level,status) values (now(),'repair',1,'predicted');
end $$;
set local role anon;
do $$
declare t text; n int;
begin
  foreach t in array array['barangays','wsp_constants','rainfall_daily','readings','disruptions',
                           'sources','continuity_chains','allocations','event_log'] loop
    execute format('select count(*) from public.%I', t) into n;
  end loop;
  assert (select count(*) from barangays) = 1, 'anon cannot see barangays row';
  -- residents (PII): RLS enabled with NO anon/authenticated policy, and the test stub grants
  -- table SELECT, so the policy design yields 0 rows (not an error). service_role sees the row.
  assert (select count(*) from residents) = 0, 'anon can read residents (PII leak)';
  begin
    insert into residents (barangay_id,channel) values ('rls1','pwa');
    raise exception 'anon insert into residents succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into barangays values ('rls2','n',0,0,1,1,'unknown','{}');
    raise exception 'anon insert succeeded';
  exception when insufficient_privilege then null;  -- RLS violation (42501)
  end;
  -- anon update/delete must affect nothing
  update barangays set name='x'; assert not found, 'anon update affected rows';
  delete from barangays; assert not found, 'anon delete affected rows';
end $$;
reset role;
set local role service_role;
insert into barangays values ('rls3','n',0,0,1,1,'unknown','{}');
reset role;
set local role authenticated;
do $$ begin
  assert (select count(*) from residents) = 0, 'authenticated can read residents (PII leak)';
end $$;
reset role;
set local role service_role;
do $$ begin
  assert (select count(*) from residents) = 1, 'service_role cannot read residents';
end $$;
reset role;
do $$ begin
  assert (select count(*) from pg_publication_tables where pubname='supabase_realtime'
          and tablename in ('disruptions','allocations','event_log')) = 3, 'realtime tables missing';
end $$;
select 'RLS OK' as result;
rollback;
