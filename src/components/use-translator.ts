"use client";

import { getTranslator } from "@/i18n";
import type { Language } from "@/lib/types";

export function useTranslator() {
  const language: Language =
    typeof document !== "undefined" && document.documentElement.lang === "sk"
      ? "sk"
      : "en";
  return getTranslator(language);
}
