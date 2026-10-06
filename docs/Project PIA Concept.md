# Tubig Patas — final merged concept for Water Security

Oct 6, 2026 · @Rolf Genree

## Verdict

Yes — they solve different halves of the same problem, and merging them is stronger than either alone. PIA Water-Back supplies the causal narrative and the LGU-allocation decision logic (why did the water stop, and who gets it first); Tubig Patas supplies the equity layer and the technical depth (what happens to the \~40% of households and barangays outside the piped network, and how the system stays usable offline). Neither draft alone wins on all five Level 1 criteria — PIA Water-Back is strong on Relevance but thin on Feasibility/Technical detail; Tubig Patas is strong on Feasibility/Technical/Innovation but was losing the sharp, locally-sourced narrative hook. Merged, one concept covers both.

## What each draft contributes

| Dimension | PIA Water-Back (your draft) | Tubig Patas (prior sessions) | Verdict |
| --- | --- | --- | --- |
| Causal diagnosis | Flags *why* water stopped — turbidity spike, drought-driven low source level, or repair work — from turbidity + plant status + rainfall + dry-spell data | Assumed a signal level existed but didn't separate the three causes explicitly | Keep PIA's three-cause diagnosis; it's the most concrete, demoable logic either draft has |
| Who it covers | Only CWD's existing piped customers (the water provider's own service area) | Explicitly includes barangay households *outside* the piped network via ranked backup sources | Keep Tubig Patas's coverage — this is the actual "equitable access" gap the brief names, and PIA Water-Back alone would repeat the mistake we already caught in the shallow outage-reporting draft |
| Allocation logic | LGU sets priorities (who gets water first, rationing, backup routing); water provider applies them to its distribution schedule | No explicit LGU-priority-setting step; ranking was automatic/rules-based with no human-in-the-loop override | Keep PIA's human-in-the-loop allocation step — judges will ask "who decides," and an LGU officer confirming priorities beats a fully automated black box |
| Resident experience | Status, reason, duration estimate, storage schedule, nearest alternative sources | Same, plus offline-first PWA and SMS keyword access for feature phones | Keep Tubig Patas's access channels — PIA Water-Back never specifies how a resident with no app or no signal receives any of this |
| Institutional memory | Explicit: once supply is restored, logs cause, duration, affected areas so the LGU prepares for next time | Present but less developed (mentioned as a side feature) | Keep PIA's framing as a first-class step, not an afterthought — it's a strong Sustainability/Scalability answer (10% L1, 13% L2) |
| Fairness/anti-abuse | Not addressed | Hash-chained ledger for emergency water credits | Keep, but scope down to "an auditable allocation log," not a full credit economy — see Open risks |
| Narrative hook for judges | Strong: Antiao River, a named SSU engineer, a national DENR quote, a comparable 2026 crisis elsewhere | Weak: generic Region VIII framing, no single named local case | Take PIA's narrative almost verbatim — it is the single best asset either draft has for Relevance & Impact (25% L1) |

## Merged concept: Tubig Patas (a PIA system for the Antiao River basin)

Catbalogan draws nearly all its treated water from one river — the Antiao, its only river, [confirmed as Catbalogan's sole river basin, now under a 2023–2027 DENR-led, 98-partner rehabilitation program](https://alpha.pna.gov.ph/articles/1210327). That single-source dependency is the system's real vulnerability, and it fails in two distinct ways: heavy rain pushes turbidity past what the treatment plant can process (a sudden interruption), or a dry spell drops the source level over weeks (a prolonged shortage and rationing). PIA Water-Back's attributed claim that "when two major vulnerabilities occur at the same time — power interruption and extremely turbid river water — the remaining sources cannot adequately meet the city's demand" (credited to SSU's Ronald Orale) could **not be independently verified** in this pass — treat it as **unverified** until someone on the team can point to where it was said, and cite it only with that caveat, or drop the named attribution and keep the mechanism (which the WSP data does support independently).

This is not an isolated or invented crisis. DENR Secretary Juan Miguel Cuna used the term "water bankruptcy" — consumption outpacing nature's ability to replenish the supply — describing it as a serious, nationwide structural problem at the **2026 World Water Day event (confirmed, March 2026)**. And it is not hypothetical elsewhere in the region: Puerto Galera, Oriental Mindoro was placed under a **state of calamity on 11 barangays due to water shortage, confirmed mid-to-late June 2026**, with the town still appealing to the national government for help as of **July 2026**. Catbalogan's single-river dependency is the same structural risk, just not yet declared a calamity.

**The merged pitch:** software cannot add water to the Antiao River. What it can do is close the gap between water existing somewhere and a specific household actually getting it — by diagnosing *why* access failed, telling the LGU *who* is affected (including the households the piped network never reached), helping the LGU *decide* fairly who gets priority, and *reaching* every resident regardless of whether they have an app, a smartphone, or a signal. Tubig Patas is that layer: a Prevention–Intervention–Action system built around Catbalogan's real monitoring data, with an equity layer PIA Water-Back's piped-customers-only version doesn't yet have.

## Final users

| Role | Who they actually are | Channel/device | Core decision the system supports |
| --- | --- | --- | --- |
| Resident | A household inside or outside CWD's piped network, including elderly/PWD residents (PIA Water-Back's "user-friendly for elderly" note) | Offline-first PWA app, or SMS keyword for feature phones | When will my water come back, should I store water now, and where's my nearest backup source |
| Barangay water captain | A barangay-level volunteer or BWSA officer who already does this informally | Same PWA, works offline, syncs when connectivity returns | Which of my barangay's backup sources (Plan A/B/C/D) is live right now |
| Water provider operator (CWD / rural waterworks) | The plant/distribution staff who already log turbidity, plant status, and reservoir levels | Admin web dashboard | Is a disruption starting, and what's driving it — turbidity, low source, or repair work |
| LGU official (CDRRMO / MENRO) | The person who actually has the authority PIA Water-Back assumes: setting allocation priority during a disruption | Admin web dashboard, real-time | Who gets water first, how is limited supply rationed, where does backup water go |
| Station/Patas Partner (optional, if time allows) | A refilling-station or water-trucking operator willing to serve as a listed backup source | SMS keywords only (no app needed) | Confirming they're open/have stock when the system lists them as someone's backup plan |

## Final features

**Prevention — normal operation, baseline monitoring**

- P0 — Operator dashboard: turbidity, plant status, reservoir level entry (seeded from CWD's 2022 WSP thresholds: 5/500 NTU, clarifier capacity ≈ 46 L/s)
- P0 — Rainfall + dry-spell data pulled from Open-Meteo, feeding the same disruption predictor
- P1 — Public-facing "current status" view, barangay by barangay, for residents checking before a trip to fetch water

**Intervention — a disruption is flagged, cause is diagnosed**

- P0 — Disruption predictor: a lightweight logistic-regression model outputs separate turbidity-risk and drought-risk probabilities (0–1), mapped to signal levels 0–4; repair work stays operator-logged, not predicted — see the Sprint plan's model-design section
- P0 — Affected-area mapping: which barangays are hit, including households outside CWD's piped network (Tubig Patas's equity layer)
- P0 — Continuity-chain lookup per affected barangay: ranked backup sources (Plan A/B/C/D), scored safety → time (WHO/UNICEF JMP 30-minute round-trip benchmark) → cost
- P1 — Vulnerable-groups and critical-facilities flag within the affected area (elderly households, health stations, schools)

**Action — LGU allocates, residents are served**

- P0 — LGU allocation-priority screen: an officer reviews the flagged disruption, confirms or adjusts who's served first, and deploys the response (dispatch, trucking, backup-source activation) — human-in-the-loop, not a black box
- P0 — Resident notification: status, cause, expected duration, when to store water, nearest alternative source — pushed via the PWA and via SMS keyword for feature-phone users
- P0 — Resident confirmation: a resident, or the barangay water captain on their behalf, confirms access was restored via the PWA or an SMS reply keyword — the only confirmation channel for the \~40% of households outside CWD's piped telemetry; this is what triggers Log the event in the process flow below
- P1 — Simple allocation log (who was prioritized, when, by whom) — scoped down from a full cryptographic ledger to an auditable, timestamped table; upgrade to hash-chaining only if time remains
- P1 — Resident complaint channel: report bad water quality, an unfair allocation, or a no-show source — routed to the LGU dashboard for resolution instead of auto-closing the disruption; a redeploy sends the response back through Action

**Loop back — institutional memory**

- P0 — Post-event record: cause, duration, affected areas, saved once a resident confirms access is restored — this closes PIA Water-Back's own loop, feeds the disruption predictor, and becomes next cycle's Prevention baseline
- P1 — Simple trend view: how often and how long each barangay has lost access, for the LGU's own planning

Cut from this build to protect the 24-hour window: the LGU-type A/B/C multi-tenant switch, the full emergency water-credit economy, and WPDx export — all good Level 2 talking points if judges ask "what's next," but not demo-critical for Level 1.

## High-level process flow

&#91;embedded content: High-level view — PIA phases plus two resident-feedback paths\]

The same loop as above, simplified: Prevention, Intervention and Action run as before, then a resident's reply forks two ways. A plain confirmation logs the event and feeds the next cycle, same as the detailed diagram. A complaint — bad water quality, an unfair allocation, or a no-show source — routes to the LGU for resolution instead of auto-closing; once resolved it either logs as resolved or sends the response back for redeployment. The detailed step-by-step version is below.

## Detailed process flow

&#91;embedded content: Resident confirmation closes the loop — 10 steps, 2 decisions\]

A "no" verdict now loops straight back to monitoring instead of logging an event. A confirmed disruption runs through ranked sourcing, LGU-confirmed allocation, and deployment, then waits on resident confirmation before Log the event fires and feeds the predictor — closing PIA Water-Back's own loop with the one signal provider telemetry can't supply: proof that the \~40% of households outside the piped network actually got water from their ranked backup source.

## Open risks and unverified claims

- [x] Confirm or drop the Ronald Orale quote — not independently verified in this pass; find the original source (news article, SSU statement, interview) before citing it by name to judges, or keep the turbidity + power-interruption mechanism without attributing it to him
- [ ] Confirm the exact turbidity/clarifier thresholds to seed from CWD's 2022 Water Safety Plan (5/500 NTU, ≈ 46 L/s clarifier capacity) are still current — a 3-year-old document
- [ ] Decide the allocation-log scope before Oct 8 — ship a plain auditable table (P0, low risk) and only add hash-chaining (P1) if the core flow is solid with hours to spare
- [ ] Legal/funding mechanism for any emergency water routing still unconfirmed — avoid overclaiming a specific procurement or pricing rule in the pitch; frame as a recommendation engine for the LGU, not an automated disbursement system
- [ ] Puerto Galera and the Antiao River rehab program are presented as parallel evidence of a national pattern, not as Catbalogan's own current crisis — keep that distinction explicit on stage so judges don't think Catbalogan is already under a state of calamity
- [ ] The predictor is trained on physics-informed synthetic data, not real incident logs — say so plainly if asked; swapping in real incident logs later changes the training set, not the architecture
- [ ] The resident complaint channel is scoped P1 — ship the simple report form plus an LGU-routed table only; do not attempt a full dispute-resolution workflow in 24 hours

## Sources

- [Catbalogan's only river to undergo major rehab](https://newsinfo.inquirer.net/1844369/catbalogans-only-river-to-undergo-major-rehab) — Inquirer, confirms the Antiao River is Catbalogan's sole river, 4.08 km, 18 barangays
- [5-year rehab program of Catbalogan's Antiao River sealed](https://alpha.pna.gov.ph/articles/1210327) — PNA, Sept 2023 DENR agreement, 98 partners, targeting 2027
- [DENR to fast-track water projects, cut red tape](https://context.ph/2026/03/19/denr-to-fast-track-water-projects-cut-red-tape/) — context.ph, March 19 2026, source of DENR Sec. Juan Miguel Cuna's "water bankruptcy" quote at the 2026 World Water Day event
- [Puerto Galera under calamity state](https://tribune.net.ph/2026/06/21/puerto-galera-under-calamity-state) — Tribune, June 21 2026, confirms 11 barangays, state of calamity declared mid-to-late June 2026
- CWD 2022 Water Safety Plan (fetched in a prior session) — turbidity thresholds, clarifier capacity, reservoir figures used throughout the project's technical claims

As of 2026-10-06. Not verified in this pass: the Ronald Orale quote as attributed in the team's draft — see Open risks.

Build plan: Sprint plan
