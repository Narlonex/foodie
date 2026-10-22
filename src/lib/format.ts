import { fromBaseAmount } from "./nutrition";
import type { TranslationKey, Translator } from "@/i18n";
import type { AmountUnit, Language, UnitSystem } from "./types";
import { localeFor } from "./dates";

export function formatNumber(
  value: number | null,
  language: Language,
  maximumFractionDigits = 0,
  minimumFractionDigits = 0,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value);
}

export function formatKcal(value: number | null, language: Language): string {
  return formatNumber(value, language, 0);
}

export function formatGrams(value: number | null, language: Language): string {
  return formatNumber(value, language, 1);
}

export function formatSalt(value: number | null, language: Language): string {
  return formatNumber(value, language, 2);
}

export function unitTranslationKey(unit: string): TranslationKey {
  switch (unit) {
    case "ml":
      return "units.ml";
    case "serving":
      return "units.serving";
    case "oz":
      return "units.oz";
    case "floz":
      return "units.floz";
    case "kcal":
      return "units.kcal";
    default:
      return "units.g";
  }
}

export function formatPortion(
  amount: number,
  amountUnit: AmountUnit,
  unitSystem: UnitSystem,
  language: Language,
  t: Translator,
): string {
  if (amountUnit === "serving") {
    const label =
      amount === 1 ? t("units.serving") : t("units.servings");
    return `${formatNumber(amount, language, 2)} ${label}`;
  }
  const display = fromBaseAmount(amount, amountUnit, unitSystem);
  return `${formatNumber(display.value, language, 2)} ${t(
    unitTranslationKey(display.unit),
  )}`;
}

export function formatPercent(value: number, language: Language): string {
  return `${formatNumber(value, language, 0)}%`;
}
