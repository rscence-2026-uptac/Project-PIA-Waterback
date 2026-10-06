// The live predictor output at the demo clock's asOf (null when not live, loading or failed).
import type { PredictorOutput } from "../contracts/predictor";
import { useAsOf } from "../demo/clockState";
import { isLive } from "./client";
import { getPredictor } from "./endpoints";
import { useResource } from "./useResource";

export function useLivePrediction(): PredictorOutput | null {
  const { asOf, asOfKey } = useAsOf();
  const live = isLive();
  const res = useResource((signal) => getPredictor(asOf, signal), [asOfKey], live);
  return live ? res.data : null;
}
