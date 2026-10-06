// Copy keys for data enums, shared between components.
import type { Safety } from "../data/mock";
import type { CopyKeyName } from "./strings";

export const SAFETY_KEY: Record<Safety, CopyKeyName> = {
  safe: "source.safe",
  boil: "source.boil",
  washing: "source.washing",
};

/** "safe to drink", lower-case for use mid-sentence ("Plan A · safe to drink"). */
export function safetyText(t: (key: CopyKeyName) => string, safety: Safety) {
  return t(SAFETY_KEY[safety]).toLowerCase();
}
