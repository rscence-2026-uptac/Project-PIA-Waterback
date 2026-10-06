# 10 — Need-based priority by settlement cluster

- **Status:** locked (owner OK 2026-10-07; Dev A review pending)
- **Owner:** Dev B
- **Reviewed by:** owner; Dev A pending (backend asks in `docs/dev-b-handoff.md` #12)
- **Depends on:** 02 (signal level), 03 (affected barangays, service level), 04 (sources with coordinates), 06 (allocation, notify), 08 (UI rules), 09 (map and list UI, reused)
- **Covers (SPEC.md IDs):** ACT-5, ACT-6, PRE-4, MEM-3 (new); supersedes ACT-4's ranking (spec 09)

## 1. What it does

Priority stops following a fixed water-rights order (LGU > Residential > Commercial > Industrial, the Philippine Water Code idea in spec 09). Instead it follows **need**: where people actually live, who is high-risk, and who has no safe water within reach. The unit is a **settlement cluster**: a group of populated 100 m cells inside a barangay. Clusters come from the WorldPop 2020 population grid, scaled to each barangay's PSA 2020 census total. Clusters are LGU-only; residents stay barangay-level.

The same score drives four things:
1. The LGU allocation list and map (`/lgu`), ranked by need, in a scrollable list. The officer can still override, and overrides are logged.
2. **Truck drop points:** the stops that reach the most unmet need within a 30-minute round trip, in visit order.
3. **Early warning by need:** high-need clusters are warned at prediction time, the rest at confirmation.
4. **Access-gap planning** (`/lgu/plan`): where a permanent source would bring the most people within 30 minutes, with or without an event.

PIA phase: Intervention (1, 2), Prevention (3), Memory/planning (4).

Judging fit:
- **Relevance:** it targets the 40% outside the network and the people a utility judge would worry about.
- **Functionality:** one score, four uses.
- **Sustainability:** the planning view supports budget decisions.

## 2. Data contract (in → out)

```ts
// apps/web/src/contracts/spec10.ts (shared-types once Dev A adopts it)
export const Cluster = z.object({
  cluster_id: z.string(),                 // "<barangay_id>-c<n>"
  barangay_id: z.string(),
  label: z.string(),                      // "Mercedes · north part"; one cluster = barangay name
  lat: z.number(), lng: z.number(),       // population-weighted centre
  people: z.number().int().nonnegative(), // PSA 2020 barangay total × this cluster's share of the grid
  people_source: z.literal("psa2020_x_worldpop2020"),
});

export const NeedRow = z.object({
  cluster_id: z.string(), barangay_id: z.string(), label: z.string(),
  people: z.number().int().nonnegative(),
  vulnerable_est: z.number().nonnegative(),          // barangay vulnerable count × people share (estimate)
  has_critical_facility: z.boolean(),                // barangay facility, credited to its most populous cluster
  nearest_safe_min: z.number().nonnegative().nullable(), // round trip to nearest safe source with coordinates; null = none known
  no_safe_access: z.boolean(),                       // nearest_safe_min > 30 or null, or barangay Level I / unserved
  hours_dry: z.number().nonnegative(),
  need_points: z.number().nonnegative(),
  reasons: z.array(z.string()),                      // human-readable, in order of weight
  suggested_rank: z.number().int().positive(),
});

// spec 06 AllocationDecision gains: cluster_id: z.string().optional()  (additive; barangay_id kept)
```

**Need score** (heuristic in people-equivalents; not a standard). Constants live in `spec10.ts`:
```
need = (people × (1 + NO_ACCESS_WEIGHT × no_safe_access)
        + VULNERABLE_WEIGHT × vulnerable_est
        + FACILITY_WEIGHT × has_critical_facility)
       × min(1 + hours_dry / 24, MAX_TIME_FACTOR)
NO_ACCESS_WEIGHT = 1     // a person with no safe water within 30 min counts double
VULNERABLE_WEIGHT = 3    // an elderly/PWD/bedridden resident counts 3 extra
FACILITY_WEIGHT = 250    // a health station / evacuation centre serves many people
MAX_TIME_FACTOR = 2      // a day without water doubles urgency, then caps
```
Ties go by people, then `cluster_id`. **Safe source** = `safety_score >= 0.8` with coordinates (spec 04 seed). **Round trip** = 2 × straight-line km × 1.3 detour ÷ 4 km/h × 60 (Dev A's rubric in `docs/backup_sources.md`).

**Truck drop points:** take `ROUTABLE.trucks × trips_each` points greedily. Each one is the cluster centre covering the most still-uncovered need within `TRUCK_WALK_RADIUS_M` (≈ 770 m, a 30-min round trip at 4 km/h with the 1.3 detour). Visit order is nearest-neighbour from `DEPOT` (a named constant with its source). Each stop gets one trip's load, `truck_litres ÷ stops` (the real need far exceeds the trucks: Canlapwas alone needs about 355,000 L a day). People served = litres ÷ 15 L. The panel shows people served, people without safe water before trucks, and people still unmet after. The drive path uses the FOSSGIS OSRM car profile, or straight lines if that fails.

**Early warning tiers:**
- **Tier 1:** clusters with `no_safe_access` or `vulnerable_est > 0`, plus the top quarter by need. They're warned when signal ≥ 2 (prediction).
- **Tier 2:** the rest, warned at confirmation.

The SMS is the existing `sms.water_off` template (≤ 160 chars). Sending stays `// MOCK:` until Dev A allows `notify-residents` before allocation.

**Access gap:** for every cluster, `people` with no safe access. The top 3 candidate sites are cluster centres, picked greedily by the people they would bring within 30 min.

## 3. Acceptance criteria

Checked against `clusters.generated.json` + `data/seedSources.ts` + the `// MOCK:` vulnerable and facility data in `mockLgu.ts`.

- [ ] `build_clusters.py` prints a QA table. Each barangay's clusters sum to its PSA 2020 population (±1 for rounding), and there are at most 4 clusters per barangay.
- [ ] `/lgu` lists clusters ranked by `need_points`. Each row shows rank, label, reason chips and need points, and the word "household(s)" does not appear.
- [ ] The list sits in a scroll container about 5 rows tall, with a thin themed scrollbar and a bottom fade while more rows remain. The page itself no longer needs a long scroll.
- [ ] ↑/↓ reorders with the FLIP animation, also after scrolling the list, and the moved row stays visible. The confirmed `AllocationDecision[]` carries `cluster_id` and the `overridden_from_suggested_rank` audit.
- [ ] The map shows need hotspots at cluster centres, sized by people and shaded by need. Clicking one scrolls only the list to that cluster's row.
- [ ] The truck panel shows `trucks × trips` stops in visit order. Each has people served and litres, with no stop over one trip's load and the total never over capacity. It also shows people without safe water before and after the trucks. The route is drawn on the map, straight-line if routing fails.
- [ ] When signal ≥ 2, the early-warning panel lists Tier 1 and Tier 2 barangays/clusters with an SMS preview of 160 characters or fewer. "Send" is marked as not connected.
- [ ] `/lgu/plan` shades clusters by people without safe access and lists 3 sites, each with "+N people within 30 min".
- [ ] Copy says "PSA 2020 census, spread by WorldPop 2020" for people and "estimate" for clusters and vulnerable counts. Every synthetic number is `// MOCK:` in code.
- [ ] Reduced motion: no smooth scroll, FLIP or map fly animations. All LGU text is ≥ 14 px, and status is never shown by colour alone.

## 4. Out of scope (for the 24 hours)

- Barangay boundary polygons. Cells go to the nearest barangay centroid, an approximation.
- Real per-cluster vulnerable counts. Residents have no location, so counts are pro-rated estimates.
- Vulnerable check-in lists for captains (specified as a future use: same score, filtered to `vulnerable_est > 0`).
- Live truck tracking, road closures, vehicle routing with time windows.
- Resident-facing cluster views.

## Decisions

- 2026-10-07: Owner chose cluster rows (reversing the barangay-only rule for the LGU view only), PSA 2020 × WorldPop 2020, fixed shown weights with officer override, and to build all four uses. Owner OK to download the WorldPop GeoTIFF (offline; raw file not committed). No new packages: numpy, tifffile, scipy and scikit-learn are already installed.

## Definition of Ready

- [x] Data contract is typed
- [x] Acceptance criteria are testable bullets
- [x] Dependencies are named
- [ ] Other dev has read and okayed it → locked on owner OK, Dev A pending

## Definition of Done

- [ ] Passes its own acceptance criteria against the seed data
- [ ] Deployed to the dev URL (not just running locally)
- [ ] Demoed live to the other dev in under two minutes
