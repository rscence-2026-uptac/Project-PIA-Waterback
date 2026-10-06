// SPEC: 01-seed-data.md — every magic number named once, commented with its source.
// Copied from packages/shared-types/src/constants.ts (Dev A, aligned with the CWD 2022 WSP,
// docs/wsp_findings.md); switch to that import once the zod versions line up.
export const WSP_CONSTANTS = {
  TURBIDITY_LIMIT_NTU: 5,          // source: CWD 2022 WSP pp.43-44 (permissible limit; above -> treat/bypass to clarifier)
  TURBIDITY_SHUTOFF_NTU: 500,      // source: CWD 2022 WSP p.43 (>= 500 temporary shut-off at Caramayon I source)
  CLARIFIER_CAPACITY_CMD: 4000,    // source: CWD 2022 WSP p.16
  CLARIFIER_CAPACITY_LPS: 46.3,    // source: CWD 2022 WSP p.16 (derived: 4,000 CMD / 86.4)
  RESERVOIR_TOTAL_M3: 440,         // source: CWD 2022 WSP p.13
  RESERVOIR_FIRE_RESERVE_M3: 100,  // source: CWD 2022 WSP p.13
  RESERVOIR_USABLE_M3: 340,        // source: CWD 2022 WSP p.13 (derived: 440 - 100)
  JMP_ROUNDTRIP_MIN: 30,           // source: WHO/UNICEF JMP benchmark
  SERVED_BARANGAYS: 26,            // source: CWD 2022 WSP pp.17,19
  SERVICE_ZONES: 10,               // source: CWD 2022 WSP p.17
  LOW_PRESSURE_ZONES: [8, 10],     // source: CWD 2022 WSP p.17 (farthest from source, low/zero pressure at peak)
} as const;
