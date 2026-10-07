// The live predictor output at the demo clock's asOf (null when not live, loading or failed).
import type { PredictorHistory, PredictorOutput } from "../contracts/predictor";
import { useAsOf } from "../demo/clockState";
import { isLive } from "./client";
import { getPredictor, getPredictorHistory } from "./endpoints";
import { useResource } from "./useResource";

export function useLivePrediction(): PredictorOutput | null {
  const { asOf, asOfKey } = useAsOf();
  const live = isLive();
  const res = useResource((signal) => getPredictor(asOf, signal), [asOfKey], live);
  return live ? res.data : null;
}

/** The live hourly history up to asOf (null when not live, loading, failed, or the deployed predictor lacks history mode). */
export function useLivePredictionHistory(hours: number, enabled = true): PredictorHistory | null {
  const { asOf, asOfKey } = useAsOf();
  const live = isLive();
  const res = useResource((signal) => getPredictorHistory(asOf, hours, signal), [asOfKey, hours], live && enabled);
  return live && enabled ? res.data : null;
}
