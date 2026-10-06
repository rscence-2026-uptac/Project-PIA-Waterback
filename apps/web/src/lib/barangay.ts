// The resident's barangay: asked once, remembered on this phone.
import { useSyncExternalStore } from "react";
import { BARANGAYS, type Barangay } from "../data/mock";
import { readSetting, subscribeSetting, writeSetting } from "./settings";

const getBarangayId = () => readSetting("barangay");

export function useBarangay(): Barangay | null {
  const id = useSyncExternalStore(subscribeSetting, getBarangayId, () => null);
  return BARANGAYS.find((p) => p.barangay_id === id) ?? null;
}

export function setBarangay(id: string) {
  writeSetting("barangay", id);
}
