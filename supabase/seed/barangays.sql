-- 26 barangays served by CWD (WSP p.8). Re-runnable.
-- Coordinates are approximate OpenStreetMap (Nominatim) centroids, not survey data.
-- Household counts are unknown (not in the WSP): NULL. zone is NULL: the p.17 zoning map (Fig. 4.0)
-- has no barangay labels, so membership cannot be read from it.
insert into barangays (barangay_id, name, lat, lng, piped_households, unpiped_households, coverage_source, zone, service_level) values
  ('poblacion-01', 'Poblacion 1', 11.7793566, 124.8809802, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-02', 'Poblacion 2', 11.7781747, 124.8818049, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-03', 'Poblacion 3', 11.7762421, 124.8797517, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-04', 'Poblacion 4', 11.7752359, 124.880791, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-05', 'Poblacion 5', 11.7744146, 124.8808816, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-06', 'Poblacion 6', 11.7733767, 124.8814669, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-07', 'Poblacion 7', 11.7735129, 124.8831998, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-08', 'Poblacion 8', 11.770344, 124.8825688, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-09', 'Poblacion 9', 11.7672978, 124.8832018, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-10', 'Poblacion 10', 11.7786172, 124.8842388, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-11', 'Poblacion 11', 11.7774794, 124.8844722, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-12', 'Poblacion 12', 11.7761342, 124.8849875, null, null, 'unknown', null, 'level_iii'),
  ('poblacion-13', 'Poblacion 13', 11.7783032, 124.8868396, null, null, 'unknown', null, 'level_iii'),
  ('san-andres', 'San Andres', 11.7874037, 124.8971854, null, null, 'unknown', null, 'level_iii'),
  ('canlapwas', 'Canlapwas', 11.782208, 124.8894566, null, null, 'unknown', null, 'level_iii'),
  ('san-pablo', 'San Pablo', 11.7801379, 124.8826179, null, null, 'unknown', null, 'level_iii'),
  ('munoz', 'Muñoz', 11.7807436, 124.8837274, null, null, 'unknown', null, 'level_iii'),
  ('mercedes', 'Mercedes', 11.782393, 124.8774376, null, null, 'unknown', null, 'level_iii'),
  ('maulong', 'Maulong', 11.7926482, 124.8660885, null, null, 'unknown', null, 'level_iii'),
  ('guindapunan', 'Guindapunan', 11.7716403, 124.8880985, null, null, 'unknown', null, 'level_iii'),
  ('guinsorongan', 'Guinsorongan', 11.7581661, 124.8851083, null, null, 'unknown', null, 'level_iii'),
  ('bunu-anan', 'Bunu-anan', 11.7540974, 124.8885802, null, null, 'unknown', null, 'level_iii'),
  ('darahuway-guti', 'Darahuway Guti', 11.7490138, 124.8721063, null, null, 'unknown', null, 'level_i'),
  ('darahuway-dako', 'Darahuway Dako', 11.7448201, 124.876064, null, null, 'unknown', null, 'level_i'),
  ('payao', 'Payao', 11.8033839, 124.862532, null, null, 'unknown', null, 'level_i'),
  ('lagundi', 'Lagundi', 11.7597601, 124.9053032, null, null, 'unknown', null, 'level_i')
on conflict (barangay_id) do nothing;
