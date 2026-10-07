// Scorecard view of a spec 02 prediction: the logistic model is additive in log-odds, so every input becomes
// exact points on one scale. score = 50 + 10 × log-odds (50 = even odds); the model's starting point plus each
// input's points is the total, and the signal-level cut-offs sit at fixed scores. Nothing here is approximate:
// the total maps to the same level the predictor computed (unless a WSP rule raised it).
import type { PredictorOutput } from "../contracts/predictor";
import type { DriverModel } from "./drivers";

// Mirrors SIGNAL_LEVEL_THRESHOLDS in packages/shared-types/src/constants.ts (p cut-offs for levels 1-4).
const SIGNAL_LEVEL_THRESHOLDS = [0.2, 0.4, 0.6, 0.8] as const;
const EVEN_ODDS = 50;
const POINTS_PER_LOG_ODDS = 10;

const logit = (p: number) => Math.log(p / (1 - p));
const toScore = (z: number) => EVEN_ODDS + POINTS_PER_LOG_ODDS * z;
const CUTOFF_Z = SIGNAL_LEVEL_THRESHOLDS.map(logit);

/** Score at which each level 1-4 starts: [36, 46, 54, 64]. */
export const LEVEL_CUTOFFS = CUTOFF_Z.map((z) => Math.round(toScore(z)));

/** Signal level (0-4) for a log-odds value; same lower-bound-inclusive rule as toSignalLevel(p). */
export function levelOfLogOdds(z: number): number {
  return CUTOFF_Z.filter((cut) => z >= cut).length;
}

/** Signal level (0-4) for a displayed (rounded) score, against the rounded cut-offs. */
export function levelOfScore(score: number): number {
  return LEVEL_CUTOFFS.filter((cut) => score >= cut).length;
}

export interface ScoreRow {
  feature: string;
  value?: number;
  unit?: string;
  /** Plain-language sentence from the predictor (fallback label). */
  text: string;
  /** Signed points this input adds (+) or removes (−). */
  points: number;
}

export interface WithoutRow {
  feature: string;
  text: string;
  /** Level the model would give if this input were zero. */
  level: number;
}

export interface Scorecard {
  model: DriverModel;
  /** Points before any input (the model's bias). */
  start: number;
  /** Inputs sorted by impact, biggest first. */
  rows: ScoreRow[];
  total: number;
  /** Level from the model score alone (a WSP rule may have raised the published level above this). */
  level: number;
  /** Risk-raising inputs whose removal alone would change the level, biggest first. */
  without: WithoutRow[];
}

/** The scorecard for one model, or null when that model did not run (WSP fallback, older deploy). */
export function scorecard(prediction: PredictorOutput, model: DriverModel): Scorecard | null {
  const bias = prediction.drivers?.baseline[model];
  const scored = (prediction.drivers?.[model] ?? []).filter(
    (d): d is typeof d & { contribution: number } => d.feature !== "wsp_rule" && typeof d.contribution === "number",
  );
  if (bias === undefined || scored.length === 0) return null;

  const z = bias + scored.reduce((sum, d) => sum + d.contribution, 0);
  const start = Math.round(toScore(bias)) || 0;
  const rows: ScoreRow[] = scored
    .map((d) => ({ feature: d.feature, value: d.value, unit: d.unit, text: d.text, points: Math.round(POINTS_PER_LOG_ODDS * d.contribution) || 0 }))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const total = Math.round(toScore(z)) || 0; // "|| 0": never show −0
  // Rounding each row can drift from the rounded total by a point or two: the biggest row absorbs it so the sum shown is exact.
  const drift = total - start - rows.reduce((sum, r) => sum + r.points, 0);
  if (drift !== 0) rows[0].points += drift;

  const level = levelOfLogOdds(z);
  const without = scored
    .filter((d) => d.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .map((d) => ({ feature: d.feature, text: d.text, level: levelOfLogOdds(z - d.contribution) }))
    .filter((w) => w.level !== level);

  return { model, start, rows, total, level, without };
}
