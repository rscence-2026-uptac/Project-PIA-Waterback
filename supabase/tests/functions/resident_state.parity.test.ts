// The edge-function copy of residentState must stay identical to packages/shared-types (spec 03 mapping table).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { residentState as shared } from "../../../packages/shared-types/src/index.ts";
import { residentState as local } from "../../functions/_shared/resident_state.generated.ts";

const SHARED_SRC = resolve(import.meta.dirname, "../../../packages/shared-types/src/resident-state.ts");
const GEN = resolve(import.meta.dirname, "../../functions/_shared/resident_state.generated.ts");

describe("resident_state.generated.ts parity", () => {
  it("every (signal, cause, service_level) combination matches shared-types", () => {
    for (const sig of [0, 1, 2, 3, 4]) for (const cause of ["turbidity", "drought", "repair", null, undefined] as const)
      for (const svc of ["level_iii", "level_i", "unserved"] as const) expect(local(sig, cause, svc)).toEqual(shared(sig, cause, svc));
  });
  it("matches the spec 03 table", () => {
    expect(local(2, "turbidity", "unserved")).toEqual({ state: "not_on_network", heads_up: true });
    expect(local(1, "turbidity", "unserved")).toEqual({ state: "not_on_network", heads_up: false });
    expect(local(0, null, "level_iii")).toEqual({ state: "flowing", heads_up: false });
    expect(local(4, "repair", "level_i")).toEqual({ state: "planned_repair", heads_up: false });
  });
  it("generated file is up to date with the shared-types source", () => {
    const expected = readFileSync(SHARED_SRC, "utf8").replace(/from "\.\/constants"/g, 'from "./constants.generated.ts"');
    expect(readFileSync(GEN, "utf8").endsWith(expected)).toBe(true);
    execFileSync("node", [resolve(import.meta.dirname, "../../functions/_shared/gen_resident_state.mjs")]); // regenerates in place: must be a no-op
    expect(readFileSync(GEN, "utf8").endsWith(expected)).toBe(true);
  });
});
