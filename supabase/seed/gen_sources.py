#!/usr/bin/env python3
"""Generates supabase/seed/sources.sql (deterministic; re-run to regenerate).
Usage: python3 -I supabase/seed/gen_sources.py > supabase/seed/sources.sql  (coverage table: --coverage)
Row id = uuid5(NS, stable_key). Rubric/assumptions: docs/backup_sources.md."""
import re, sys, uuid, math, pathlib
root = pathlib.Path(__file__).resolve().parent
NS = uuid.uuid5(uuid.NAMESPACE_DNS, "sources.pia-waterback")
bar = {}
for m in re.finditer(r"\('([a-z0-9-]+)', '([^']*)', (?:'[^']*'|null), (null|[0-9.]+), (null|[0-9.]+), .*?'(level_iii|level_i|unserved)'\)", (root / "barangays.sql").read_text()):
    bid, name, la, lo, lvl = m.groups()
    bar[bid] = dict(name=name, lat=None if la == "null" else float(la), lng=None if lo == "null" else float(lo), lvl=lvl)
assert len(bar) == 57, len(bar)

SAFETY = dict(refill=0.9, truck=0.8, neighbor=0.85, deepwell=0.7, untreated=0.4)
REFILL_PRICE = 25  # PHP per 5-gal container, ESTIMATE (national range 25-35)
DEFAULT_IN_BARANGAY = 10   # min round trip, in-barangay point with unconfirmed location
DEFAULT_UNKNOWN = 40       # min round trip, barangay centroid unknown (unserved)
TRUCK_MIN = 10

def hav(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(x))
def mins(km): return max(1, round(2 * km * 1.3 / 4 * 60))

OSM_BASE = "https://www.openstreetmap.org/"
refills = [  # real, OSM shop=water
    ("aquaquest", "Aquaquest.com refill station (Del Rosario St.)", 11.7746340, 124.8814307, OSM_BASE + "node/3376469925"),
    ("aqua-blue", "Aqua Blue Water Station", 11.7709170, 124.8824883, OSM_BASE + "node/4721500289"),
]
wells = [  # real, OSM man_made=water_well
    ("osm-well-9208545293", "Unnamed public-access well (OSM, pump 2-10 HP)", 11.7768125, 124.8872486, OSM_BASE + "node/9208545293", 15),
]
rows = []  # dict
def add(key, bid, name, typ, safety, travel, cost, prov, ref, sim, lat=None, lng=None):
    rows.append(dict(id=uuid.uuid5(NS, key), key=key, bid=bid, name=name, type=typ, safety=safety, travel=travel,
                     cost=cost, prov=prov, ref=ref, sim=sim, lat=lat, lng=lng))
q = lambda s: "null" if s is None else "'" + s.replace("'", "''") + "'"

served = [b for b, v in bar.items() if v["lat"] is not None]  # every barangay with a centroid (served or not)
l3 = [b for b in served if bar[b]["lvl"] == "level_iii"]

# --- WSP (real) ---
WSPREF = "CWD 2022 WSP, "
add("wsp:lagundi-deepwell-atm", "lagundi", "Lagundi deep well pumping station - ATM tubig machine (Level I)", "communal_tap", SAFETY["deepwell"],
    mins(hav(bar["lagundi"]["lat"], bar["lagundi"]["lng"], 11.762139, 124.910889)), 0, "wsp",
    WSPREF + "printed p.14 s3.2.12 (PDF p.19); coords from N11 45'43.7\" E124 54'39.2\"; 2HP pump, chlorinator, 2+1 m3 tanks; travel = haversine from centroid", False, 11.762139, 124.910889)
add("wsp:lagundi-barangay-hall-atm", "lagundi", "Lagundi barangay hall - ATM tubig machine (Level I)", "communal_tap", SAFETY["deepwell"], DEFAULT_IN_BARANGAY, 0, "wsp",
    WSPREF + "printed p.14 s3.2.12 ('two ATMs installed in the pumping station and at barangay Hall'); exact location unknown, travel = in-barangay default 10 min", False)
add("wsp:payao-deepwell", "payao", "Payao deep well pumping station (1.5 L/s, 2x2 m3 tanks; built for LGU facilities)", "communal_tap", SAFETY["deepwell"],
    mins(hav(bar["payao"]["lat"], bar["payao"]["lng"], 11.802250, 124.867278)), 0, "wsp",
    WSPREF + "printed p.14 s3.2.13 (PDF p.19); coords from N11 48'8.1\" E124 52'2.2\"; WSP says it supplies LGU facilities (relocation site, COVID facilities, govt offices); public access for residents unverified", False, 11.802250, 124.867278)
for b, nm in (("darahuway-guti", "Darahuway Gote"), ("darahuway-dako", "Darahuway Daco")):
    add(f"wsp:cogao-{b}", b, f"Level I communal point via Cogao booster pump line - {nm}", "communal_tap", SAFETY["deepwell"], DEFAULT_IN_BARANGAY, 0, "wsp",
        WSPREF + "printed p.14 s3.2.10 (Cogao booster, 2\" x 1.7 km line to the two island barangays) + p.8/p.19 (Level I); point location not stated, in-barangay default 10 min; fed from the CWD network, so NOT independent of a Kulador failure", False)

# --- OSM (real) ---
for key, nm, la, lo, ref in refills:
    for b in served:
        d = hav(bar[b]["lat"], bar[b]["lng"], la, lo)
        add(f"osm:{key}:{b}", b, nm, "refill_station", SAFETY["refill"], mins(d), REFILL_PRICE, "osm",
            f"{ref} (Overpass 2026-10-06, shop=water); price = ESTIMATE PHP25/5gal; travel = 2x{d:.2f}km x1.3 /4kmh", False, la, lo)
# keep nearest always, second only if <=30 min
byb = {}
for r in [r for r in rows if r["key"].startswith("osm:") and r["type"] == "refill_station"]:
    byb.setdefault(r["bid"], []).append(r)
drop = set()
for b, rs in byb.items():
    rs.sort(key=lambda r: (r["travel"], r["key"]))
    for r in rs[1:]:
        if r["travel"] > 30: drop.add(r["key"])
rows[:] = [r for r in rows if r["key"] not in drop]
# barangays with no centroid (Nominatim miss): Aquaquest by convention at default travel
for b in bar:
    if bar[b]["lat"] is None:
        add(f"osm:aquaquest:{b}", b, refills[0][1], "refill_station", SAFETY["refill"], DEFAULT_UNKNOWN, REFILL_PRICE, "osm",
            refills[0][4] + " (shop=water); barangay centroid unknown (no Nominatim match): travel = default 40 min (ASSUMPTION, unverified); price = ESTIMATE PHP25/5gal", False, refills[0][2], refills[0][3])
for key, nm, la, lo, ref, thr in wells:
    for b in served:
        d = hav(bar[b]["lat"], bar[b]["lng"], la, lo)
        if mins(d) <= thr:
            add(f"osm:{key}:{b}", b, nm, "communal_tap", SAFETY["untreated"], mins(d), 0, "osm",
                f"{ref} (man_made=water_well, access=permissive); untreated, quality unknown; travel from centroid", False, la, lo)
jla, jlo = 11.8169126, 124.8413309
add("osm:jetmatic-well:payao", "payao", "Jet Matic (Artesian Well), operator Est. Michael Baldemor Estrada", "communal_tap", SAFETY["untreated"],
    mins(hav(bar["payao"]["lat"], bar["payao"]["lng"], jla, jlo)), 0, "osm",
    OSM_BASE + "node/3750592063 (man_made=water_well); assigned to nearest barangay WITH a known centroid, actual barangay unverified; low confidence; untreated/commercial status unknown", False, jla, jlo)

# --- placeholders (simulated) ---
SIM = "Simulated placeholder (docs/backup_sources.md rubric): "
for b in bar:
    add(f"ph:truck:{b}", b, "LGU water truck drop point (simulated)", "trucking", SAFETY["truck"], TRUCK_MIN, 0, "placeholder",
        SIM + "chlorinated LGU/BFP trucking 0.8, fixed 10 min to drop point, free; no real drop point list was found", True)
    if bar[b]["lat"] is not None:
        cands = sorted(((hav(bar[b]["lat"], bar[b]["lng"], bar[c]["lat"], bar[c]["lng"]), c) for c in l3 if c != b))
        d, c = cands[0]
        add(f"ph:neighbor:{b}", b, f"Neighboring barangay supply: {bar[c]['name']} (simulated)", "neighboring_barangay", SAFETY["neighbor"], mins(d), 0, "placeholder",
            SIM + f"nearest other CWD Level III barangay by centroid ({d:.2f} km); assumes it still has piped supply (not true in a plant-wide failure)", True)
    else:
        add(f"ph:neighbor:{b}", b, "Neighboring barangay supply: nearest piped barangay (simulated)", "neighboring_barangay", SAFETY["neighbor"], DEFAULT_UNKNOWN, 0, "placeholder",
            SIM + "centroids of this and nearby barangays unknown: default 40 min", True)

rows.sort(key=lambda r: (r["bid"], r["key"]))
if "--coverage" in sys.argv:
    for b, v in bar.items():
        rr = [r for r in rows if r["bid"] == b]
        print(f"| {b} | {v['lvl']} | {sum(1 for r in rr if r['prov']!='placeholder')} | {sum(1 for r in rr if r['prov']=='placeholder')} | {sum(1 for r in rr if r['travel']>30)} |")
    sys.exit()
print("""-- Backup water sources (spec 04 input). Generated by supabase/seed/gen_sources.py - do not hand-edit.
-- Upsert by id = uuid5(namespace uuid5(DNS,'sources.pia-waterback'), stable key); re-runnable. Research + citations: docs/backup_sources.md.
-- provenance: wsp = CWD 2022 WSP; osm = OpenStreetMap (Overpass 2026-10-06); placeholder = SIMULATED (is_simulated = true).
-- RUBRIC (ASSUMPTIONS, not measurements):
--   safety_score: refill station (treated, DOH-regulated) 0.9; LGU/BFP trucked chlorinated water 0.8; neighboring barangay on piped supply 0.85;
--                 communal chlorinated deep well (WSP) 0.7; untreated spring/open well 0.4.
--   travel_minutes: round trip on foot = round(2 x haversine(barangay centroid, source) x 1.3 detour / 4 km/h x 60), min 1.
--                   Trucking = fixed 10. In-barangay point with unknown location = 10 (default). Barangay centroid unknown (Nominatim miss) = 40 (default). Centroids are approximate OSM values (barangays.sql).
--   cost_php_per_unit (unit = one 5-gal container): refill = PHP 25 ESTIMATE (national range 25-35, no Catbalogan price found); trucked/communal/neighbor = 0.
-- The `name`/`source_ref` of every row says where its numbers come from.
insert into sources (id, barangay_id, name, type, safety_score, travel_minutes, cost_php_per_unit, active, provenance, source_ref, is_simulated, lat, lng) values""")
out = []
for r in rows:
    out.append(f"  -- {r['key']}\n  ('{r['id']}', '{r['bid']}', {q(r['name'])}, '{r['type']}', {r['safety']}, {r['travel']}, {r['cost']}, true, '{r['prov']}', {q(r['ref'])}, {'true' if r['sim'] else 'false'}, {r['lat'] if r['lat'] is not None else 'null'}, {r['lng'] if r['lng'] is not None else 'null'})")
print(",\n".join(out))
print("""on conflict (id) do update set
  barangay_id = excluded.barangay_id, name = excluded.name, type = excluded.type, safety_score = excluded.safety_score,
  travel_minutes = excluded.travel_minutes, cost_php_per_unit = excluded.cost_php_per_unit, active = excluded.active,
  provenance = excluded.provenance, source_ref = excluded.source_ref, is_simulated = excluded.is_simulated, lat = excluded.lat, lng = excluded.lng;""")
