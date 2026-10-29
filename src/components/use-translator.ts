"use client";

import { getTranslator } from "@/i18n";
import type { Language } from "@/lib/types";

export function useTranslator() {
  const documentLanguage =
    typeof document !== "undefined" ? document.documentElement.lang : "en";
  const language: Language =
    documentLanguage === "sk" || documentLanguage === "cs"
      ? documentLanguage
      : "en";
  return getTranslator(language);
}
