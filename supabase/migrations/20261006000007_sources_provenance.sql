-- Backup-source provenance (docs/backup_sources.md). Columns only: table count unchanged (thirteen).
-- Real rows carry a citation in source_ref; placeholders are flagged is_simulated so the UI can label them.
alter table sources
  add column provenance text not null default 'placeholder' check (provenance in ('wsp','osm','web','placeholder')),
  add column source_ref text,                                   -- citation (URL or WSP page); null only for hand-entered rows
  add column is_simulated boolean not null default false,       -- true = simulated placeholder, never a real facility
  add column lat double precision check (lat between -90 and 90),   -- source location when known
  add column lng double precision check (lng between -180 and 180);
