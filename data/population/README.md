# Settlement clusters (spec 10)

`python data/population/build_clusters.py` (offline; numpy, tifffile, scikit-learn) writes:
- `apps/web/src/data/clusters.generated.json`
- `supabase/seed/clusters.sql` (DRAFT for Dev A review)

**Inputs**
- WorldPop 2020 Philippines, 100 m, UN-adjusted, constrained (BSGM):
  https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/PHL/phl_ppp_2020_UNadj_constrained.tif
  Download it to `data/population/raw/` (gitignored, never committed).
- PSA 2020 census per barangay, transcribed from PhilAtlas (accessed 2026-10-07) inside the script.
- Barangay centroids and service level from `supabase/seed/barangays.sql`.

**Method**
1. Cells with population > 0 inside lat 11.68–11.88, lng 124.80–125.00.
2. Each cell goes to the nearest barangay centroid. **This is an approximation**: there are no boundary
   polygons, and the centroids are OSM points, so grid sums per barangay are rough.
3. Per barangay, DBSCAN (eps 300 m, cell population as weight), noise folded into the nearest cluster,
   at most 4 clusters (smallest merged into nearest).
4. `people = PSA 2020 x cluster share of the barangay's grid`, rounded so clusters sum exactly to PSA.
   A barangay with no populated cells gets one cluster at its centroid holding the whole PSA figure.

Copy to use: "PSA 2020 census, spread by WorldPop 2020"; cluster figures are estimates.
