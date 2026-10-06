#!/usr/bin/env node
// Regenerates _shared/resident_state.generated.ts from packages/shared-types/src/resident-state.ts
// (so edge functions never import outside supabase/functions). Only change: the constants import path.
// Usage: node supabase/functions/_shared/gen_resident_state.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "../../../packages/shared-types/src/resident-state.ts"), "utf8");
export const transform = (s) => s.replace(/from "\.\/constants"/g, 'from "./constants.generated.ts"');
const out = "// GENERATED from packages/shared-types/src/resident-state.ts — never hand-edit. Regenerate: node supabase/functions/_shared/gen_resident_state.mjs\n" + transform(src);
if (!out.includes("constants.generated.ts")) throw new Error("resident-state.ts no longer imports ./constants; update the generator");
writeFileSync(resolve(here, "resident_state.generated.ts"), out);
console.log("generated resident_state.generated.ts");
