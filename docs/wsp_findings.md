# CWD 2022 Water Safety Plan: findings for the data model

Oct 6, 2026 · Dev A

Source: `docs/Catbalogan WD WSP 2022.pdf`. Page numbers are the **printed** numbers in the document (PDF page = printed + 5). Only the main body (printed pp. 1–52) was reviewed; Annexes E–K (Operations Manual, DRRMP) were not.

Web cross-check: [catbaloganwd.gov.ph/about us](https://catbaloganwd.gov.ph/about%20us.html), [Tribune, 7 Jul 2026: severe water crisis hits Catbalogan City](https://tribune.net.ph/2026/07/07/severe-water-crisis-hits-catbalogan-city).

## TL;DR

- **One treatment plant: Kulador.** All main sources flow to it. The network is blended, not zoned by source, so a Kulador problem hits the whole service area.
- **26 barangays in 10 zones**, about 9,229 customers. 4 barangays are Level I (communal points only), and household coverage is 60%.
- Our 46 L/s and 340 m³ figures hold up, but both are **derived** from the WSP rather than stated in it, so we cite the derivation.
- The 500 NTU shutdown applies to the **Caramayon I source**, not to Kulador.
- The WSP monitors turbidity **daily by hand**. Our hourly readings simulate proposed sensors.
- **Drought is not a hazard in the WSP**, so the drought model is our extension.

## 1. Sources and treatment

| Source | Type | Capacity | Treatment | Page |
|---|---|---|---|---|
| Kulador (Antiao River) | Surface | Clarifier rated 4,000 CMD (≈ 46.3 L/s); upgrade planned to 6,000–7,000 CMD | Pre-chlorination, PAC + polymer, static mixer, flocculation, clarifier, bag filters, post-chlorination (Fig. 2.0 also shows a rapid sand filter) | 11, 15, 16 |
| Masacpasac | Spring, gravity | 55 L/s rated (two lines, CI 6" and CI 10"); about 64% of total production | Flows by gravity to Kulador | 12 |
| Caramayon I | Spring, pumped | 140 L/s at source; 3 pumps totaling 91 L/s; 300 hp standby generator; 13.2 kV line | Flows to Kulador | 12 |
| Caramayon II | Spring, pumped | 125 hp pump with VFD, running since Dec 2019; capacity not stated | Flows to Kulador | 12 |
| Tumalistis, Executive (supplemental deep wells) | Deep well | 4.5 L/s and 1.5 L/s | Chlorination only | 13 |
| Payao, Lagundi (satellite deep wells) | Deep well | 1.5 L/s and not stated | Chlorination only | 13–14 |

> "four (4) main water sources, namely Kulador (Surface), Caramayon I, Caramayon II, and Masacpasac (Spring)" (p. 11)

Spring water "flows by gravity to the Kulador Treatment Plant" (p. 12), and Fig. 1.0 (p. 15) shows both springs feeding Kulador. Transmission lines carry about 90–120 L/s (p. 9).

## 2. Turbidity thresholds

| Threshold | What the WSP says | Where it applies | Page |
|---|---|---|---|
| 5 NTU | Permissible limit (also PNSDW, the national drinking-water standard, at the tap). Above it: "By-pass thru Clarifier System for treatment" | Caramayon I source, Kulador | 17–18, 43–44 |
| ≥ 500 NTU | "For 500NTU and above – Temporary Shut-off operation" | **Caramayon I source only** | 43 |

At Kulador, the response above 5 NTU is to dose PAC, caustic soda and polymer, chlorinate before and after treatment, and replace or clean the filter bags (p. 44). No intermediate intake-reduction threshold is given.

**Monitoring is daily**, with a portable turbidimeter at Caramayon I and Kulador. Chlorine residual is checked daily at 20 points, and production readings are taken at 6:00 AM and 6:00 PM (pp. 43–47, 51).

## 3. Storage

- One reservoir: **440 m³** concrete, built 1935, recommissioned 2006, in Brgy. 13 at 35 m elevation. It is used to "augment the high demand during peak hours. The remaining 100cu.m. of water was reserved for fire fighting purposes." (p. 13)
- Usable capacity is **440 − 100 = 340 m³**. The WSP never states 340 directly.
- Fig. 2.0 (p. 15) shows "Intermittent use of 440 Cum Reservoir". The CWD website calls it "historical, not currently used", which contradicts the WSP, so treat it as in use intermittently.
- Small tanks: Executive 1 m³, Lagundi 2 m³ + 1 m³, Payao 2 × 2 m³ (pp. 13–14).

## 4. Distribution and service area

- "serving 26 barangays subdivided into 10 zones" (p. 17), with a zoning map. No mapping from zone to source is given. The network is blended after Kulador.
- **Zones 8 (south) and 10 (north)** are farthest from the source and get low to zero pressure at peak (p. 17).
- 9,229 customers; 26 barangays (22 Level III, 4 Level I) (p. 19). Household coverage is 60% (p. 9).
- Barangays served (p. 8): Poblacion 1–13, San Andres, Canlapwas, San Pablo, Muñoz, Mercedes, Maulong, Guindapunan, Guinsorongan, Bunu-anan, plus Level I: Darahuway Guti, Darahuway Dako, Payao, Lagundi.
- Booster pumps: Canlapwas, Mabini, Antiao (for Maulong and Mercedes), V&G, and Cogao (for Darahuway and Bunu-anan) (pp. 13–14).

## 5. Hazards (risk assessment)

| Hazard | Where | Control | Page |
|---|---|---|---|
| Soil erosion causing high turbidity | Every source (S1.3, S2.3, S3.3, S5.3) | Tree planting, LGU ordinances. Residual risk: "Problems on turbidity still existent" | 20–23 |
| Insufficient filtration ("only 50% of the total production") | Kulador (T1.1) | Filter bags, clarifier upgrade | 22 |
| Chlorinator power failure | Kulador (T3.3) | Drip-type standby chlorinator | 26 |
| Power outage at the pumps | Caramayon | Notify Samelco II, run the generator, keep fuel and spare pumps | 43 |
| Pipe leaks or repair | Distribution (D1.1–D1.4, D3, D4) | Relocate pipes away from drainage canals, train staff, flush hydrants | 26–27 |
| Low or zero pressure at peak | Maulong, Mercedes, Brgy. 13, Bunu-anan (D2.1–D2.5) | Booster pumps | 27–28 |
| Drought or low source flow | **Not in WSP** | No rationing or rotation schedule given | n/a |

The July 2026 crisis (Tribune) combined two of these: a power outage stopped Caramayon, and Antiao turbidity went beyond what Kulador could treat. The impact was citywide.

## 6. Corrections to our specs

| Our assumption | WSP | Status | Action |
|---|---|---|---|
| `TURBIDITY_WARNING_NTU = 5` | 5 NTU permissible limit; bypass or treat above it (pp. 43–44) | Confirmed, but it is a limit, not a warning | Rename to `TURBIDITY_LIMIT_NTU` |
| Shutdown when > 500 NTU | "500NTU and above – Temporary Shut-off", Caramayon I only (p. 43) | Corrected | Use `>=`; describe it as a source shut-off |
| Clarifier 46 L/s | 4,000 CMD ≈ 46.3 L/s (p. 16) | Confirmed by conversion | Cite "4,000 CMD (p. 16)" |
| Reservoir usable 340 m³ | 440 m³ minus 100 m³ fire reserve (p. 13) | Confirmed by derivation | Cite the derivation; add the total and the reserve |
| One treatment plant | Kulador only | Confirmed | none |
| Readings tied to a purok or barangay | Readings are taken at sources and the plant | Corrected | Readings get an `intake_id` |
| Hourly turbidity readings | Daily, manual | Mismatch | State that hourly readings simulate proposed sensors |
| Drought risk from the WSP | Not in WSP | Our extension | Present it that way in the pitch |
| Kulador discharge 20 L/s (website) | Not in WSP | Unverified | Don't use it |

## 7. Open items

- **Zone membership:** which barangay is in which zone. The zoning map on p. 17 may answer this.
- **Household counts per barangay:** not in the WSP. Needs PSA or barangay data.
- **Barangay centroids:** not in the WSP. Use approximate OpenStreetMap coordinates, labeled as approximate.
- **Annexes E–K (Operations Manual, DRRMP):** not reviewed yet. They may contain interruption and rationing procedures.
