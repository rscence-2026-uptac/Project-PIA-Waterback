# NN — <Spec name>

- **Status:** draft <!-- draft → locked → built → done | cut -->
- **Owner:** <Dev A / Dev B / Teammate 3>
- **Reviewed by:** <the other dev, once okayed>
- **Depends on:** <spec numbers, or "none">
- **Covers (SPEC.md IDs):** <e.g. INT-3>

## 1. What it does

<One short paragraph. Which user, which decision it supports, which PIA phase.>

## 2. Data contract (in → out)

```ts
// Zod schema, lives in packages/shared-types
import { z } from "zod";

export const ExampleInput = z.object({
  // ...
});

export const ExampleOutput = z.object({
  // ...
});
```

## 3. Acceptance criteria

Testable bullets, checked against the seed data from `01-seed-data.md` (never live CWD numbers). No "works correctly".

- [ ] Given <seed scenario>, <input> returns <exact expected output>
- [ ] ...

## 4. Out of scope (for the 24 hours)

- ...

## Definition of Ready (check before locking)

- [ ] Data contract is typed
- [ ] Acceptance criteria are testable bullets
- [ ] Dependencies are named
- [ ] Other dev has read and okayed it → set Status to `locked`

## Definition of Done (check before marking done)

- [ ] Passes its own acceptance criteria against the seed data
- [ ] Deployed to the dev URL (not just running locally)
- [ ] Demoed live to the other dev in under two minutes
