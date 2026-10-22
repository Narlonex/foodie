import type { Metadata } from "next";
import { getTranslator, type TranslationKey } from "@/i18n";
import { getRequestPreferences } from "./auth";

/** Builds a localized page title from the persisted language cookie/profile. */
export async function pageMetadata(key: TranslationKey): Promise<Metadata> {
  const { language } = await getRequestPreferences();
  return { title: getTranslator(language)(key) };
}
