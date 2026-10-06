-- Run after all seeds. Read-only assertions on backup sources (docs/backup_sources.md).
do $$ begin
  assert (select count(*) from barangays b where (select count(*) from sources s where s.barangay_id = b.barangay_id and s.active) < 3) = 0, 'every barangay has >= 3 active sources';
  assert (select count(*) from sources where provenance <> 'placeholder' and (source_ref is null or btrim(source_ref) = '')) = 0, 'non-placeholder rows have source_ref';
  assert (select count(*) from sources where provenance = 'placeholder' and not is_simulated) = 0, 'placeholders are simulated';
  assert (select count(*) from sources where provenance <> 'placeholder' and is_simulated) = 0, 'real rows are not simulated';
  assert (select count(*) from barangays b where b.service_level = 'level_i' and not exists (
            select 1 from sources s where s.barangay_id = b.barangay_id and s.provenance = 'wsp' and s.type = 'communal_tap' and s.active)) = 0, 'level_i barangays have a WSP communal source';
  assert (select count(*) from sources where safety_score not between 0 and 1 or travel_minutes < 0 or cost_php_per_unit < 0
            or (lat is not null and lat not between 11.5 and 12.0) or (lng is not null and lng not between 124.5 and 125.2)) = 0, 'ranges valid (lat/lng inside Catbalogan area)';
  assert (select count(*) from sources where provenance not in ('wsp','osm','web','placeholder')) = 0, 'provenance enum';
  assert (select count(*) from sources where travel_minutes > 30) >= 1, 'at least one JMP > 30 min case exists naturally';
  assert (select count(*) from (select id from sources group by id having count(*) > 1) d) = 0, 'unique ids';
  assert (select count(*) from barangays where lat is null or lng is null) = 0, 'all 57 barangays have a centroid (Nominatim geocoding of the 31 unserved)';
  assert (select count(*) from barangays where lat not between 11.5 and 12.0 or lng not between 124.5 and 125.2) = 0, 'centroids inside the Catbalogan area';
  assert (select count(*) from sources where travel_minutes = 40 and provenance <> 'wsp' and name like '%unknown%') = 0, 'no default-40 rows where a centroid exists';
end $$;

-- barangays upsert updates coordinates but a NULL never wipes an existing value (rolled back)
begin;
do $$ declare v double precision; w double precision; begin
  insert into barangays (barangay_id, name, wsp_name, lat, lng, coverage_source, service_level) values ('albalate', 'Albalate', null, 11.9, 124.9, 'unknown', 'unserved')
    on conflict (barangay_id) do update set name = excluded.name, wsp_name = excluded.wsp_name, service_level = excluded.service_level,
      lat = coalesce(excluded.lat, barangays.lat), lng = coalesce(excluded.lng, barangays.lng);
  select lat, lng into v, w from barangays where barangay_id = 'albalate';
  assert v = 11.9 and w = 124.9, 'upsert updates lat/lng';
  insert into barangays (barangay_id, name, wsp_name, lat, lng, coverage_source, service_level) values ('albalate', 'Albalate', null, null, null, 'unknown', 'unserved')
    on conflict (barangay_id) do update set lat = coalesce(excluded.lat, barangays.lat), lng = coalesce(excluded.lng, barangays.lng);
  select lat, lng into v, w from barangays where barangay_id = 'albalate';
  assert v = 11.9 and w = 124.9, 'null lat/lng does not wipe';
end $$;
rollback;

-- continuity_chains: one row per (disruption, barangay) so rank-chain can upsert (migration 000008)
begin;
do $$ declare d uuid := gen_random_uuid(); begin
  insert into disruptions (id, started_at, cause, signal_level, status) values (d, now(), 'turbidity', 3, 'confirmed');
  insert into continuity_chains (barangay_id, disruption_id, ranked_source_ids) values ('poblacion-01', d, '{}');
  begin
    insert into continuity_chains (barangay_id, disruption_id, ranked_source_ids) values ('poblacion-01', d, '{}');
    assert false, 'duplicate chain row must fail';
  exception when unique_violation then null;
  end;
  insert into continuity_chains (barangay_id, disruption_id, ranked_source_ids) values ('poblacion-01', d, '{}')
    on conflict (disruption_id, barangay_id) do update set ranked_source_ids = excluded.ranked_source_ids, computed_at = now();
  assert (select count(*) from continuity_chains where disruption_id = d) = 1, 'upsert keeps one row';
end $$;
rollback;
select 'SOURCES CHECKS OK' as result;
