import { en } from "./en";
import { sk } from "./sk";

export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number>;
export type Translator = (key: TranslationKey, params?: TranslationParams) => string;

export const dictionaries = { en, sk } as const;
export type Language = keyof typeof dictionaries;

export function interpolate(
  template: string,
  params?: TranslationParams,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(
  language: string,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const dictionary = language === "sk" ? sk : en;
  const template = dictionary[key] ?? en[key] ?? key;
  return interpolate(template, params);
}

export function getTranslator(language: string): Translator {
  return (key, params) => translate(language, key, params);
}

export function translationKeys(): TranslationKey[] {
  return Object.keys(en).sort() as TranslationKey[];
}

export function missingTranslationKeys(
  dictionary: Record<string, string>,
): string[] {
  return translationKeys().filter((key) => !dictionary[key]);
}

export function extraTranslationKeys(
  dictionary: Record<string, string>,
): string[] {
  const known = new Set<string>(translationKeys());
  return Object.keys(dictionary).filter((key) => !known.has(key));
}

export { en, sk };
