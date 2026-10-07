// Which prediction the operator screens explain (shared by Monitor and the Predictions tab).
import type { PredictorOutput } from "../../contracts/predictor";
import type { useCopy } from "../../copy/i18n";
import type { CopyKeyName } from "../../copy/strings";
import { isLive } from "../../api/client";
import { useLivePrediction, useLivePredictionHistory } from "../../api/usePrediction";
import type { PredictorHistory } from "../../contracts/predictor";
import { LEVEL_CUTOFFS } from "../../lib/scorecard";
import { OPERATOR_PREDICTION, OPERATOR_RISK_HISTORY } from "../../data/mock";
import { hasDrivers, type DriverModel } from "../../lib/drivers";

export const MODELS: DriverModel[] = ["turbidity", "drought"];

const HISTORY_HOURS = 48;
export type RiskHistory = { end: string; turbidity: number[]; drought: number[] };

/** Middle of a level's score band: where an hour with no model score (WSP fallback) is drawn on the level axis. */
const levelMidScore = (level: number) => {
  const edges = [0, ...LEVEL_CUTOFFS, LEVEL_CUTOFFS[3] + 20];
  return Math.round((edges[level] + edges[level + 1]) / 2);
};

/** Live history -> chart series; null when there is nothing to draw (every hour fell back for both models). */
export function toRiskHistory(history: PredictorHistory | null): RiskHistory | null {
  if (!history || history.hours.length < 2) return null;
  if (history.hours.every((h) => h.score_turbidity === null && h.score_drought === null)) return null;
  return {
    end: history.hours[history.hours.length - 1].as_of,
    turbidity: history.hours.map((h) => h.score_turbidity ?? levelMidScore(h.turbidity_level)),
    drought: history.hours.map((h) => h.score_drought ?? levelMidScore(h.drought_level)),
  };
}

/** The live prediction (+ its 48 h history when asked: the Predictions tab) when it carries drivers; the sample ones when not live; else null. */
export function useOperatorPrediction({ withHistory = false } = {}): { prediction: PredictorOutput | null; sample: boolean; history: RiskHistory | null } {
  const live = useLivePrediction();
  const liveHistory = useLivePredictionHistory(HISTORY_HOURS, withHistory);
  if (hasDrivers(live)) return { prediction: live, sample: false, history: toRiskHistory(liveHistory) };
  if (!isLive()) return { prediction: OPERATOR_PREDICTION, sample: true, history: OPERATOR_RISK_HISTORY };
  return { prediction: null, sample: false, history: null };
}

/** Level name for a signal level 0-4 ("Low" ... "Very high"). */
export const band = (t: ReturnType<typeof useCopy>["t"], level: number) => t(`why.band_${Math.min(4, Math.max(0, level))}` as CopyKeyName);

/**
 * Background tint per signal level (0 Low ... 4 Very high), shared by every Predictions chart.
 * A cool-to-warm ramp on DESIGN.md tokens: calm Clear Sky at Low, near-neutral in the middle, Soft Coral deepening
 * to Very high, so warmth appears only where the risk is (The One Warm Colour Rule) and the eye goes there first.
 */
export const LEVEL_TINT = [
  "rgba(163, 208, 232, 0.38)", // sky
  "rgba(163, 208, 232, 0.14)",
  "rgba(244, 132, 108, 0.12)", // coral
  "rgba(244, 132, 108, 0.24)",
  "rgba(244, 132, 108, 0.38)",
] as const;

export type Trend = "rising" | "easing" | "steady";
const TREND_WINDOW_H = 6;
const TREND_MIN_POINTS = 3;

/** Direction of the last few hours of hourly scores. */
export function trendOf(series: number[]): Trend {
  const last = series.length - 1;
  const delta = series[last] - series[Math.max(0, last - TREND_WINDOW_H)];
  return delta >= TREND_MIN_POINTS ? "rising" : delta <= -TREND_MIN_POINTS ? "easing" : "steady";
}

/** Hours the series has been at its current level (null if it has been there the whole window). */
export function hoursAtLevel(series: number[], levelOf: (score: number) => number): number | null {
  const last = series.length - 1;
  const now = levelOf(series[last]);
  let i = last;
  while (i > 0 && levelOf(series[i - 1]) === now) i--;
  return i === 0 ? null : last - i;
}
