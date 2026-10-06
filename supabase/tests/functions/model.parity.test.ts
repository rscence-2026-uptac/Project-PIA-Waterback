import { describe, expect, it } from "vitest";
import { droughtRisk, modelMeta, turbidityRisk } from "../../functions/_shared/model.generated.ts";
import { loadVectors, usingReal, vectorsPath } from "./helpers.ts";

describe(`model parity vs ${usingReal ? "REAL ml/predictor_test_vectors.json" : "TEMPORARY fixture (real file not available)"}`, () => {
  const v = loadVectors();
  it("reports which vectors are in use", () => {
    console.log(`[parity] vectors=${vectorsPath} model_version=${modelMeta.version}`);
    expect(v.turbidity.length).toBeGreaterThan(0);
    expect(v.drought.length).toBeGreaterThan(0);
  });
  it.each(v.turbidity.map((x: any, i: number) => [i, x]))("turbidity vector %i", (_i, x: any) => {
    expect(Math.abs(turbidityRisk(x.features) - x.p)).toBeLessThan(1e-9);
  });
  it.each(v.drought.map((x: any, i: number) => [i, x]))("drought vector %i", (_i, x: any) => {
    expect(Math.abs(droughtRisk(x.features) - x.p)).toBeLessThan(1e-9);
  });
  if (usingReal) it("generated model is not the TEMP fixture", () => expect(modelMeta.version).not.toBe("TEMP-fixture"));
});
