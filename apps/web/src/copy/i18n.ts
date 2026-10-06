// SPEC: 08 — read copy from the one table, in the language saved on this phone.
import { useSyncExternalStore } from "react";
import type { Language } from "../contracts/spec08";
import { COPY_BY_KEY, type CopyKeyName } from "./strings";
import { readSetting, subscribeSetting, writeSetting } from "../lib/settings";

// English until the Waray/Filipino drafts are reviewed (see strings.ts).
const DEFAULT_LANGUAGE: Language = "english";
const LANGUAGES: Language[] = ["waray", "filipino", "english"];

export function getLanguage(): Language {
  const saved = readSetting("language");
  return LANGUAGES.includes(saved as Language) ? (saved as Language) : DEFAULT_LANGUAGE;
}

export function setLanguage(language: Language) {
  writeSetting("language", language);
}

export type Vars = Record<string, string | number>;

export function translate(language: Language, key: CopyKeyName, vars?: Vars): string {
  const row = COPY_BY_KEY.get(key);
  if (!row) return key;
  let text = row[language];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/** Returns t(key, vars) bound to the current language; re-renders when it changes. */
export function useCopy() {
  const language = useSyncExternalStore(subscribeSetting, getLanguage, getLanguage);
  const t = (key: CopyKeyName, vars?: Vars) => translate(language, key, vars);
  return { t, language, languages: LANGUAGES };
}
