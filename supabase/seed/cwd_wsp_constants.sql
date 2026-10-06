-- Constants from the CWD 2022 Water Safety Plan. Re-runnable.
insert into wsp_constants (key, value, unit, source) values
  ('turbidity_limit_ntu',        5,    'NTU',   'CWD 2022 WSP p.43-44'),                 -- source: CWD 2022 WSP p.43-44
  ('turbidity_shutoff_ntu',      500,  'NTU',   'CWD 2022 WSP p.43 (Caramayon I source, >= 500)'), -- source: CWD 2022 WSP p.43
  ('clarifier_capacity_cmd',     4000, 'm3/day','CWD 2022 WSP p.16'),                    -- source: CWD 2022 WSP p.16
  ('clarifier_capacity_lps',     46.3, 'L/s',   'derived: 4,000 CMD / 86.4; CWD 2022 WSP p.16'), -- source: CWD 2022 WSP p.16 (derived)
  ('reservoir_total_m3',         440,  'm3',    'CWD 2022 WSP p.13'),                    -- source: CWD 2022 WSP p.13
  ('reservoir_fire_reserve_m3',  100,  'm3',    'CWD 2022 WSP p.13'),                    -- source: CWD 2022 WSP p.13
  ('reservoir_usable_m3',        340,  'm3',    'derived: 440 - 100; CWD 2022 WSP p.13'),-- source: CWD 2022 WSP p.13 (derived)
  ('jmp_roundtrip_min',          30,   'min',   'WHO/UNICEF JMP benchmark (not from WSP)'), -- source: WHO/UNICEF JMP
  ('served_barangays',           26,   'count', 'CWD 2022 WSP p.17, p.19'),              -- source: CWD 2022 WSP p.17,19
  ('service_zones',              10,   'count', 'CWD 2022 WSP p.17')                     -- source: CWD 2022 WSP p.17
on conflict (key) do nothing;
