-- Water intakes feeding the single Kulador plant (CWD 2022 WSP pp.11-12, 15). Deep wells out of scope. Re-runnable.
insert into intakes (intake_id, name, type, rated_capacity_lps, treated_at_kulador, power_dependent, wsp_page) values
  ('kulador',      'Kulador (Antiao River)', 'surface', 46.3, true, false, 'pp.11,16'), -- 4,000 CMD clarifier
  ('masacpasac',   'Masacpasac',             'spring',  55,   true, false, 'p.12'),
  ('caramayon_1',  'Caramayon I',            'spring',  91,   true, true,  'p.12'),     -- 3 pumps totaling 91 L/s
  ('caramayon_2',  'Caramayon II',           'spring',  null, true, true,  'p.12')      -- capacity not stated
on conflict (intake_id) do nothing;
