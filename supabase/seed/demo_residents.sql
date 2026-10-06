-- Demo residents for the simulated-handset SMS demo (spec 06 / README "SMS demo"). Upsert: re-runnable.
-- PLACEHOLDER NUMBERS: +63900000000X is an obviously fake block (valid for the residents.phone regex, not a real
-- subscriber). sms-webhook's `?demo=1` path accepts ONLY this block, and never sends a real SMS to it.
-- They sit in the Level I barangays that top suggested_rank, plus poblacion-01. `reset` in scripts/demo never deletes them.
-- Apply to the remote: supabase db query --linked -f supabase/seed/demo_residents.sql
insert into residents (id, barangay_id, display_name, phone, preferred_language, channel, is_vulnerable) values
  ('00000000-0000-4000-8000-0000000d0001', 'lagundi',        'Demo resident Lagundi',        '+639000000001', 'waray',    'sms', false),
  ('00000000-0000-4000-8000-0000000d0002', 'payao',          'Demo resident Payao',          '+639000000002', 'filipino', 'sms', false),
  ('00000000-0000-4000-8000-0000000d0003', 'darahuway-dako', 'Demo resident Darahuway Dako', '+639000000003', 'english',  'sms', false),
  ('00000000-0000-4000-8000-0000000d0004', 'darahuway-guti', 'Demo resident Darahuway Guti', '+639000000004', 'waray',    'sms', true),
  ('00000000-0000-4000-8000-0000000d0005', 'poblacion-01',   'Demo resident Poblacion 1 (PWA)', null,         'english',  'pwa', false)
on conflict (id) do update set
  barangay_id = excluded.barangay_id, display_name = excluded.display_name, phone = excluded.phone,
  preferred_language = excluded.preferred_language, channel = excluded.channel, is_vulnerable = excluded.is_vulnerable;
