-- Spec 04: rank-chain upserts one continuity_chains row per (disruption, barangay). Index only: table count unchanged (thirteen).
-- Collapse any pre-existing duplicates (keep the newest) so the index can be created.
delete from continuity_chains c using continuity_chains n
  where c.disruption_id = n.disruption_id and c.barangay_id = n.barangay_id
    and (c.computed_at, c.id) < (n.computed_at, n.id);
create unique index continuity_chains_disruption_barangay_uq on continuity_chains (disruption_id, barangay_id);
drop index if exists continuity_chains_disruption_idx;
