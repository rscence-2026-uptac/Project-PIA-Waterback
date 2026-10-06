// SPEC: 01-seed-data.md — every magic number named once, commented with its source.
// Copied verbatim; moves to packages/shared-types when Dev A creates it.
export const WSP_CONSTANTS = {
  TURBIDITY_WARNING_NTU: 5,     // source: CWD 2022 Water Safety Plan
  TURBIDITY_SHUTDOWN_NTU: 500,  // source: CWD 2022 Water Safety Plan — forces shutdown
  CLARIFIER_CAPACITY_LPS: 46,   // source: CWD 2022 Water Safety Plan
  RESERVOIR_USABLE_M3: 340,     // source: CWD 2022 Water Safety Plan
  JMP_ROUNDTRIP_MIN: 30,        // source: WHO/UNICEF JMP benchmark
} as const;
