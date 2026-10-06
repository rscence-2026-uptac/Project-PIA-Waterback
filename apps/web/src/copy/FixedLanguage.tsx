// Pins every useCopy() inside to one language, whatever the phone's saved choice is.
import type { ReactNode } from "react";
import type { Language } from "../contracts/spec08";
import { FixedLanguageContext } from "./i18n";

export function FixedLanguage({ language, children }: { language: Language; children: ReactNode }) {
  return <FixedLanguageContext.Provider value={language}>{children}</FixedLanguageContext.Provider>;
}
