-- sources.network_dependent (spec 04). Columns only: table count unchanged (thirteen).
-- true = the source is fed from the blended CWD network (WSP pp.12, 15), so it is dry in a system-wide failure (turbidity, drought).
-- rank-chain excludes such rows for system-wide causes and keeps them for 'repair'.
alter table sources add column network_dependent boolean not null default false;

-- Backfill for databases seeded before this migration (the regenerated seed/sources.sql sets it as well).
update sources set network_dependent = true
 where type = 'neighboring_barangay' or id in (select id from sources where name like 'Level I communal point via Cogao booster pump line%');
