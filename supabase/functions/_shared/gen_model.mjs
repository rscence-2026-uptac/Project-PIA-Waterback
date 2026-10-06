#!/usr/bin/env node
// Regenerates the files the edge function imports (so it never reaches outside supabase/functions):
//   _shared/model.generated.ts      <- ml/predictor_coefficients.json
//   _shared/constants.generated.ts  <- packages/shared-types/src/constants.ts
// Usage: node supabase/functions/_shared/gen_model.mjs [path/to/coefficients.json]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const coefPath = process.argv[2] ? resolve(process.argv[2]) : resolve(root, "ml/predictor_coefficients.json");
const c = JSON.parse(readFileSync(coefPath, "utf8"));

const EXPECTED = {
  turbidity: ["turbidity_ntu", "turbidity_slope_per_hr", "rain_24h_mm", "rain_72h_mm", "forecast_rain_48h_mm"],
  drought: ["reservoir_pct", "rain_14d_mm", "rain_30d_mm", "days_since_rain_over_5mm"],
};
for (const [name, feats] of Object.entries(EXPECTED)) {
  const m = c[name];
  if (!m || typeof m.bias !== "number") throw new Error(`${name}: missing bias`);
  if (JSON.stringify(m.features) !== JSON.stringify(feats)) throw new Error(`${name}: unexpected feature list ${JSON.stringify(m.features)}`);
  for (const f of feats) if (typeof m.weights?.[f] !== "number") throw new Error(`${name}: missing weight for ${f}`);
}

const HEADER = "// GENERATED from %SRC% — never hand-edit. Regenerate: node supabase/functions/_shared/gen_model.mjs\n";
const model = (name, fn, feats, typeName) => `
export const ${name}Coefficients = ${JSON.stringify({ bias: c[name].bias, weights: Object.fromEntries(feats.map((f) => [f, c[name].weights[f]])) }, null, 2)} as const;

export interface ${typeName} {
${feats.map((f) => `  ${f}: number;`).join("\n")}
}

/** p = sigmoid(bias + sum(weight * feature)), RAW feature units. */
export function ${fn}(f: ${typeName}): number {
  const z = ${name}Coefficients.bias
${feats.map((x) => `    + ${name}Coefficients.weights.${x} * f.${x}`).join("\n")};
  return sigmoid(z);
}
`;
const out =
  HEADER.replace("%SRC%", "ml/predictor_coefficients.json") +
  `
export const modelMeta = ${JSON.stringify({ version: c.version, trained_at: c.trained_at, seed: c.seed, training_data: c.training_data, decision_threshold: c.decision_threshold, signal_level_thresholds: c.signal_level_thresholds }, null, 2)} as const;

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));
` +
  model("turbidity", "turbidityRisk", EXPECTED.turbidity, "TurbidityModelFeatures") +
  model("drought", "droughtRisk", EXPECTED.drought, "DroughtModelFeatures");
writeFileSync(resolve(here, "model.generated.ts"), out);

const consts = readFileSync(resolve(root, "packages/shared-types/src/constants.ts"), "utf8");
writeFileSync(
  resolve(here, "constants.generated.ts"),
  HEADER.replace("%SRC%", "packages/shared-types/src/constants.ts") + consts,
);
console.log(`generated model.generated.ts (from ${coefPath}) and constants.generated.ts`);
