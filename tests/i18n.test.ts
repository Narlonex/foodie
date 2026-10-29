import { describe, expect, it } from "vitest";
import {
  cs,
  dictionaries,
  en,
  extraTranslationKeys,
  getTranslator,
  interpolate,
  missingTranslationKeys,
  sk,
  translate,
  translationKeys,
} from "@/i18n";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
}

describe("translation dictionaries", () => {
  it("has no missing English keys in any language", () => {
    expect(missingTranslationKeys(sk)).toEqual([]);
    expect(missingTranslationKeys(cs)).toEqual([]);
    expect(missingTranslationKeys(en)).toEqual([]);
  });

  it("has no extra keys outside the English dictionary", () => {
    expect(extraTranslationKeys(sk)).toEqual([]);
    expect(extraTranslationKeys(cs)).toEqual([]);
    expect(extraTranslationKeys(en)).toEqual([]);
  });

  it("contains no empty strings", () => {
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), `${language}.${key}`).not.toBe("");
      }
    }
  });

  it("uses the same interpolation placeholders in every language", () => {
    for (const key of translationKeys()) {
      expect(placeholders(sk[key]), `${key} placeholders`).toEqual(
        placeholders(en[key]),
      );
      expect(placeholders(cs[key]), `${key} placeholders`).toEqual(
        placeholders(en[key]),
      );
    }
  });

  it("translates every label that is not a proper name or unit", () => {
    const legitimate = new Set([
      "app.name",
      "common.count",
      "units.kcal",
      "units.gramsPer",
      "units.mlPer",
      "sources.off",
      "sources.usda",
      "sources.usdaShort",
      "dashboard.mealTotal",
      "dayTypes.caloriesShort",
      "nav.menu",
      "language.slovak",
      "foodData.offTitle",
      "foodData.usdaTitle",
      "search.openFoodFacts",
      "search.usda",
    ]);
    const identicalButTranslatable = translationKeys().filter(
      (key) =>
        en[key] === sk[key] &&
        /[a-z]{4}/i.test(en[key]) &&
        !legitimate.has(key),
    );
    expect(identicalButTranslatable).toEqual([]);
  });
});

describe("translator behaviour", () => {
  it("returns the requested language", () => {
    expect(translate("sk", "common.save")).toBe("Uložiť");
    expect(translate("cs", "common.save")).toBe("Uložit");
    expect(translate("en", "common.save")).toBe("Save");
  });

  it("falls back to English for an unknown language", () => {
    expect(translate("de", "common.save")).toBe("Save");
  });

  it("falls back to the key for a missing translation key", () => {
    expect(translate("en", "missing.key" as never)).toBe("missing.key");
  });

  it("interpolates values and leaves unknown placeholders intact", () => {
    expect(interpolate("Eat {count} items on {date}", { count: 3 })).toBe(
      "Eat 3 items on {date}",
    );
    expect(interpolate("No params")).toBe("No params");
  });

  it("produces a usable translator per language", () => {
    expect(getTranslator("sk")("common.cancel")).toBe("Zrušiť");
    expect(getTranslator("cs")("common.cancel")).toBe("Zrušit");
    expect(getTranslator("en")("common.cancel")).toBe("Cancel");
  });
});
