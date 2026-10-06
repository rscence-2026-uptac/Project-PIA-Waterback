import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { droughtCoefficients, droughtRisk, modelMeta, turbidityCoefficients, turbidityRisk } from "../../functions/_shared/model.generated.ts";
import { VECTORS_PATH, loadCoefs, loadVectors } from "./helpers.ts";

const TURB_V3 = ["turbidity_ntu", "rain_24h_mm", "rain_72h_mm", "forecast_rain_48h_mm"];

describe("model parity vs ml/predictor_test_vectors.json (v3)", () => {
  const v = loadVectors();
  const c = loadCoefs();
  it("v3 version, feature lists and generated coefficients match ml/predictor_coefficients.json", () => {
    console.log(`[parity] vectors=${VECTORS_PATH} model_version=${modelMeta.version}`);
    expect(modelMeta.version).toBe("2026-10-06.3");
    expect(c.version).toBe(modelMeta.version);
    expect(Object.keys(turbidityCoefficients.weights)).toEqual(TURB_V3);
    expect(c.turbidity.features).toEqual(TURB_V3);
    expect(turbidityCoefficients.bias).toBe(c.turbidity.bias);
    for (const f of TURB_V3) expect((turbidityCoefficients.weights as Record<string, number>)[f]).toBe(c.turbidity.weights[f]);
    for (const f of Object.keys(droughtCoefficients.weights)) expect((droughtCoefficients.weights as Record<string, number>)[f]).toBe(c.drought.weights[f]);
    expect(JSON.stringify(turbidityCoefficients)).not.toContain("slope");
  });
  it("vectors carry the v3 feature set (>= 25 per model)", () => {
    expect(v.turbidity.length).toBeGreaterThanOrEqual(25);
    expect(v.drought.length).toBeGreaterThanOrEqual(25);
    for (const x of v.turbidity) expect(Object.keys(x.features)).toEqual(TURB_V3);
  });
  it("all four turbidity weights are positive (physically intuitive)", () => {
    for (const f of TURB_V3) expect((turbidityCoefficients.weights as Record<string, number>)[f]).toBeGreaterThan(0);
  });
  it.each(v.turbidity.map((x: any, i: number) => [i, x]))("turbidity vector %i", (_i, x: any) => {
    expect(Math.abs(turbidityRisk(x.features) - x.p)).toBeLessThan(1e-9);
  });
  it.each(v.drought.map((x: any, i: number) => [i, x]))("drought vector %i", (_i, x: any) => {
    expect(Math.abs(droughtRisk(x.features) - x.p)).toBeLessThan(1e-9);
  });
  it("also matches the independent v3 candidate vectors (ml/predictor_v3_test_vectors.json)", () => {
    const cand = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../ml/predictor_v3_test_vectors.json"), "utf8"));
    expect(cand.vectors.length).toBeGreaterThanOrEqual(25);
    for (const x of cand.vectors) expect(Math.abs(turbidityRisk(x.features) - x.p)).toBeLessThan(1e-9);
  });
});
