"""Build settlement clusters for spec 10 (need-based priority).

Inputs : WorldPop 2020 PHL 100 m UN-adjusted CONSTRAINED GeoTIFF (data/population/raw/, gitignored),
         barangay centroids + service_level from supabase/seed/barangays.sql,
         PSA 2020 census population per barangay (transcribed below).
Outputs: apps/web/src/data/clusters.generated.json, supabase/seed/clusters.sql (DRAFT for Dev A)
Run    : python data/population/build_clusters.py [--fetch]  (--fetch: download + clip once)   (offline; numpy, tifffile, scikit-learn only)

APPROXIMATION: there are no barangay boundary polygons. Every populated grid cell goes to the NEAREST
barangay centroid (OSM centroids, not survey data), so grid sums per barangay are rough; PSA totals
are what fix the final headcount (people = PSA x cluster share of the barangay's grid).
"""
import json, math, re, sys, urllib.request, os
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import tifffile
from sklearn.cluster import DBSCAN

ROOT = Path(__file__).resolve().parents[2]
TIF = ROOT / "data/population/raw/phl_ppp_2020_UNadj_constrained.tif"
WORLDPOP_URL = "https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/PHL/phl_ppp_2020_UNadj_constrained.tif"
PSA_URL = "https://www.philatlas.com/visayas/r08/samar/catbalogan.html"
PSA_ACCESSED = "2026-10-07"
# Wider than the 11.68-11.88 / 124.80-125.00 box in the brief: 12 barangay centroids (Cagusipan, Rama, Cagutsan,
# Mombon, Cinco, Bagongon, ...) lie outside it. Cells farther than MAX_CELL_KM from every centroid are dropped.
BBOX = dict(lat0=11.67, lat1=11.93, lng0=124.66, lng1=124.95)
MAX_CELL_KM = 2.5
EPS_M, MIN_SAMPLES, MAX_CLUSTERS, CENTRE_M = 300, 2, 4, 150

# PSA 2020 census population, transcribed from PhilAtlas (PSA data), accessed 2026-10-07.
# PhilAtlas city total shown: 106,440. Keys are our barangay_ids.
PSA_2020 = {
    "albalate": 293, "bagongon": 707, "bangon": 272, "basiao": 700, "buluan": 791, "bunu-anan": 4786,
    "cabugawan": 964, "cagudalo": 275, "cagusipan": 231, "cagutian": 235, "cagutsan": 1215,
    "canhawan-gote": 307, "canlapwas": 11805, "cawayan": 165, "cinco": 865, "darahuway-dako": 810,
    "darahuway-guti": 689, "estaka": 1148, "guindapunan": 3597,  # PhilAtlas spells it Guindaponan
    "guinsorongan": 4255, "ibol": 541, "iguid": 1697, "lagundi": 1023, "libas": 325, "lobo": 186,
    "manguehay": 135, "maulong": 5954, "mercedes": 12281, "mombon": 861, "munoz": 1712,
    "new-mahayag": 1393, "old-mahayag": 1434, "palanyogon": 320, "pangdan": 3334, "payao": 2093,
    "poblacion-01": 1238, "poblacion-10": 1838, "poblacion-11": 1027, "poblacion-12": 620,
    "poblacion-13": 4266, "poblacion-02": 799, "poblacion-03": 3102, "poblacion-04": 1038,
    "poblacion-05": 537, "poblacion-06": 1344, "poblacion-07": 1368, "poblacion-08": 1169,
    "poblacion-09": 2988, "pupua": 1594, "rama": 1683, "san-andres": 5898, "san-pablo": 1209,
    "san-roque": 1454, "san-vicente": 936, "silanga": 2974, "socorro": 1773, "totoringon": 186,
}
PSA_CITY_TOTAL = 106440  # as printed by PhilAtlas

# --- barangays from the seed SQL -------------------------------------------------------------
sql = (ROOT / "supabase/seed/barangays.sql").read_text(encoding="utf-8")
rows = re.findall(r"\('([a-z0-9-]+)', '([^']*)', (?:null|'[^']*'), ([\d.]+), ([\d.]+), .*?, '(level_iii|level_i|unserved)'\)", sql)
brgy = {}
for bid, name, lat, lng, lvl in rows:
    disp = re.sub(r"\s*\(.*?\)", "", name).strip()  # "Poblacion 5 (Barangay 5)" -> "Poblacion 5"
    if bid == "guindapunan":
        disp = "Guindapunan"  # app shows the WSP spelling (barangays.ts)
    brgy[bid] = dict(name=disp, lat=float(lat), lng=float(lng), service_level=lvl, served=lvl != "unserved")
assert len(brgy) == 57, len(brgy)
ts = (ROOT / "apps/web/src/data/barangays.ts").read_text(encoding="utf-8")
assert sum(b["served"] for b in brgy.values()) == 26
missing_psa = sorted(b for b in brgy if b not in PSA_2020)
extra_psa = sorted(b for b in PSA_2020 if b not in brgy)
assert not extra_psa, extra_psa

# --- raster window: clipped Catbalogan file; `--fetch` makes it from the country GeoTIFF ----------
NPZ = ROOT / "data/population/raw/catbalogan_ppp_2020.npz"

def fetch_and_clip():
    """One-time: download the country GeoTIFF, save only the Catbalogan window, delete the country file."""
    if not TIF.exists():
        TIF.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(WORLDPOP_URL, TIF)
    with tifffile.TiffFile(TIF) as t:
        page = t.pages[0]
        sx, sy, _ = page.tags["ModelPixelScaleTag"].value
        _, _, _, X0, Y0, _ = page.tags["ModelTiepointTag"].value  # top-left corner of pixel (0,0)
        nodata = float(page.tags["GDAL_NODATA"].value) if "GDAL_NODATA" in page.tags else -99999.0
        r0 = int(math.floor((Y0 - BBOX["lat1"]) / sy)); r1 = int(math.ceil((Y0 - BBOX["lat0"]) / sy))
        c0 = int(math.floor((BBOX["lng0"] - X0) / sx)); c1 = int(math.ceil((BBOX["lng1"] - X0) / sx))
        # LZW needs imagecodecs (not installed), so decode with PIL; crop keeps only the window.
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = None
        with Image.open(TIF) as im:
            win = np.array(im.crop((c0, r0, c1, r1)), dtype=np.float32)
    # geotransform of the window: top-left corner and pixel size, degrees
    np.savez_compressed(NPZ, array=win, x0=X0 + c0 * sx, y0=Y0 - r0 * sy, sx=sx, sy=sy, nodata=nodata,
                        source=WORLDPOP_URL)
    print(f"saved {NPZ} {win.shape} ({NPZ.stat().st_size} bytes); delete the country file {TIF.name} once verified")

if "--fetch" in sys.argv:
    fetch_and_clip()
z = np.load(NPZ)
win = z["array"].astype(np.float64)
sx, sy, X0, Y0, nodata = float(z["sx"]), float(z["sy"]), float(z["x0"]), float(z["y0"]), float(z["nodata"])
r0 = c0 = 0
print(f"clip {win.shape}, scale {sx:.6f}, nodata {nodata}")
win[(win <= -1e30) | (win == nodata) | ~np.isfinite(win) | (win < 0)] = 0
rr, cc = np.nonzero(win > 0)
pop = win[rr, cc]
clat = Y0 - (r0 + rr + 0.5) * sy
clng = X0 + (c0 + cc + 0.5) * sx
inb = (clat >= BBOX["lat0"]) & (clat <= BBOX["lat1"]) & (clng >= BBOX["lng0"]) & (clng <= BBOX["lng1"])
clat, clng, pop = clat[inb], clng[inb], pop[inb]
print(f"{len(pop)} populated cells in bbox, grid sum {pop.sum():.0f}")

LAT0 = 11.78
MX = 111320 * math.cos(math.radians(LAT0)); MY = 110574  # metres per degree (equirectangular)
def xy(lat, lng): return np.column_stack([(np.asarray(lng) - 124.9) * MX, (np.asarray(lat) - LAT0) * MY])

ids = list(brgy)
bxy = xy([brgy[i]["lat"] for i in ids], [brgy[i]["lng"] for i in ids])
cxy = xy(clat, clng)
d2 = ((cxy[:, None, :] - bxy[None, :, :]) ** 2).sum(-1)
owner = np.argmin(d2, axis=1)  # nearest centroid
near = d2.min(1) <= (MAX_CELL_KM * 1000) ** 2  # drop cells far from every centroid (other municipalities / sea)
print(f"dropped {int((~near).sum())} cells (pop {pop[~near].sum():.0f}) farther than {MAX_CELL_KM} km from any centroid")
owner = np.where(near, owner, -1)

def compass(dx, dy):
    if math.hypot(dx, dy) < CENTRE_M: return "centre"
    names = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"]
    return names[int(round(math.degrees(math.atan2(dy, dx)) / 45)) % 8]

def weighted(idx):
    w = pop[idx]
    return (cxy[idx] * w[:, None]).sum(0) / w.sum()

def to_latlng(p): return LAT0 + p[1] / MY, 124.9 + p[0] / MX

out_b, out_c = [], []
qa = []
for k, bid in enumerate(ids):
    b = brgy[bid]; idx = np.nonzero(owner == k)[0]
    psa = PSA_2020.get(bid); grid = float(pop[idx].sum())
    groups = []
    if len(idx) == 0:
        groups = [None]  # no populated cells: one cluster at the centroid
    else:
        # sample_weight = cell population (cells hold < 1 to ~100 people; min_samples is on summed weight)
        lab = DBSCAN(eps=EPS_M, min_samples=MIN_SAMPLES).fit(cxy[idx], sample_weight=pop[idx]).labels_ if len(idx) > 1 else np.array([0])
        groups = [idx[lab == l] for l in sorted(set(lab)) if l != -1]
        noise = idx[lab == -1]
        if not groups:
            groups = [idx]; noise = idx[:0]
        for n in noise:  # drop noise into the nearest cluster
            cents = np.array([weighted(g) for g in groups])
            j = int(np.argmin(((cents - cxy[n]) ** 2).sum(1)))
            groups[j] = np.append(groups[j], n)
        while len(groups) > MAX_CLUSTERS:  # merge the smallest into its nearest neighbour
            tot = [pop[g].sum() for g in groups]; s = int(np.argmin(tot))
            cents = np.array([weighted(g) for g in groups])
            d = ((cents - cents[s]) ** 2).sum(1); d[s] = np.inf; j = int(np.argmin(d))
            groups[j] = np.concatenate([groups[j], groups[s]]); groups.pop(s)
    if groups[0] is None:
        clus = [dict(lat=b["lat"], lng=b["lng"], gp=0.0, dxy=(0, 0))]
    else:
        clus = []
        for g in groups:
            c = weighted(g); la, ln = to_latlng(c)
            clus.append(dict(lat=la, lng=ln, gp=float(pop[g].sum()), dxy=(c[0] - bxy[k][0], c[1] - bxy[k][1])))
    clus.sort(key=lambda c: -c["gp"])
    total_gp = sum(c["gp"] for c in clus)
    if psa is None:
        people = [round(c["gp"]) for c in clus]
    elif total_gp == 0:
        people = [psa]
    else:
        raw = [psa * c["gp"] / total_gp for c in clus]
        people = [int(math.floor(x)) for x in raw]
        rem = psa - sum(people)  # largest-remainder fix so the sum is exactly PSA
        for j in sorted(range(len(raw)), key=lambda j: -(raw[j] - people[j]))[:rem]: people[j] += 1
    labels = []
    for n, c in enumerate(clus):
        lbl = b["name"] if len(clus) == 1 else f'{b["name"]} · {compass(*c["dxy"])} part'
        while lbl in labels: lbl += " 2"
        labels.append(lbl)
    for n, c in enumerate(clus):
        out_c.append(dict(cluster_id=f"{bid}-c{n+1}", barangay_id=bid, label=labels[n],
                          lat=round(c["lat"], 6), lng=round(c["lng"], 6), people=int(people[n]),
                          people_source="psa2020_x_worldpop2020"))
    out_b.append(dict(barangay_id=bid, name=b["name"], served=b["served"], service_level=b["service_level"],
                      psa_2020=psa, grid_people=round(grid, 1), cells=int(len(idx)), clusters=len(clus)))
    qa.append((bid, psa, grid, len(idx), len(clus), sum(people)))

result = dict(
    generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    sources=dict(worldpop=WORLDPOP_URL, psa=PSA_URL, psa_accessed=PSA_ACCESSED,
                 note="cells assigned to nearest barangay centroid (no boundary polygons)"),
    barangays=out_b, clusters=out_c, missing_psa=missing_psa)
jp = ROOT / "apps/web/src/data/clusters.generated.json"
jp.parent.mkdir(parents=True, exist_ok=True)
with open(jp, "w", encoding="utf-8") as f:
    f.write("{\n" + ",\n".join(f'"{k}": ' + json.dumps(v, ensure_ascii=False, separators=(",", ":")) if k in ("sources", "generated_at", "missing_psa")
                                else f'"{k}": [\n' + ",\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in v) + "\n]"
                                for k, v in result.items()) + "\n}\n")

def q(s): return "'" + s.replace("'", "''") + "'"
sqlp = ROOT / "supabase/seed/clusters.sql"
with open(sqlp, "w", encoding="utf-8") as f:
    f.write("-- DRAFT for Dev A review (spec 10). Generated by data/population/build_clusters.py; do not hand-edit.\n"
            "-- people = PSA 2020 barangay total x cluster share of the WorldPop 2020 grid (cells -> nearest barangay centroid).\n"
            "-- Not yet applied to any database. Table shape is a proposal.\n"
            "create table if not exists clusters (\n  cluster_id text primary key,\n  barangay_id text not null references barangays (barangay_id),\n"
            "  label text not null,\n  lat double precision not null,\n  lng double precision not null,\n"
            "  people integer not null check (people >= 0),\n  people_source text not null default 'psa2020_x_worldpop2020'\n);\n\n"
            "insert into clusters (cluster_id, barangay_id, label, lat, lng, people, people_source) values\n")
    f.write(",\n".join(f"  ({q(c['cluster_id'])}, {q(c['barangay_id'])}, {q(c['label'])}, {c['lat']}, {c['lng']}, {c['people']}, {q(c['people_source'])})" for c in out_c))
    f.write("\non conflict (cluster_id) do update set\n  label = excluded.label, lat = excluded.lat, lng = excluded.lng,\n  people = excluded.people, people_source = excluded.people_source;\n")

print(f"\n{'barangay_id':16}{'PSA2020':>8}{'grid':>9}{'cells':>6}{'clus':>5}{'sum':>8}")
for bid, psa, g, n, k, s in qa:
    flag = "  <- no cells, centroid" if n == 0 else ("  <- MISSING PSA" if psa is None else ("" if s == psa else "  <- MISMATCH"))
    print(f"{bid:16}{str(psa):>8}{g:9.1f}{n:6}{k:5}{s:8}{flag}")
print(f"\nPSA sum {sum(PSA_2020.values())} vs PhilAtlas city total {PSA_CITY_TOTAL}; cluster sum {sum(c['people'] for c in out_c)}; grid sum (assigned) {sum(b['grid_people'] for b in out_b):.0f}")
print(f"{len(out_c)} clusters; missing PSA: {missing_psa}")
print("Top 10:", [(c["label"], c["people"]) for c in sorted(out_c, key=lambda c: -c["people"])[:10]])
