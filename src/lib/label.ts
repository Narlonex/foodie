import { KJ_PER_KCAL, roundTo } from "./nutrition";
import {
  NUTRIENT_KEYS,
  type BasisType,
  type NutrientKey,
} from "./types";

export interface LabelScanResult {
  basisType: BasisType | null;
  servingSize: number | null;
  servingUnit: "g" | "ml" | null;
  packageQuantity: number | null;
  packageUnit: "g" | "ml" | null;
  nutrients: Partial<Record<NutrientKey, number>>;
  matchedKeys: NutrientKey[];
}

const NUMBER = String.raw`\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?`;
const VALUE_WITH_UNIT = String.raw`(${NUMBER})\s*(kg|mg|kcal|kj|g|ml)\b`;

const ENERGY_WORDS =
  /\b(?:energy|energeticka hodnota|energie|calories|kalorie|kaloricka hodnota)(?![a-z])/;
const SODIUM_WORDS = /\b(?:sodium|sodik|natrium|sodio)(?![a-z])/;

const KEYWORDS: Record<
  Exclude<NutrientKey, "kcal" | "kj">,
  RegExp
> = {
  protein: /\b(?:protein|proteine|bielkoviny|bilkoviny|eiweiss)(?![a-z])/,
  carbs:
    /\b(?:carbohydrate|carbohydrates|sacharidy|sacharid|kohlenhydrate|hidratos)(?![a-z])/,
  sugars: /\b(?:sugars|sugar|cukry|cukor|zucker|azucares)(?![a-z])/,
  fat: /\b(?:fat|fett|tuky|tuk|grasas|lipides)(?![a-z])/,
  satFat:
    /\b(?:saturated|saturates|sat fat|nasytene|nasycene|gesattigt|gesattigte)(?![a-z])/,
  fiber: /\b(?:fibre|fiber|vlaknina|ballaststoffe)(?![a-z])/,
  salt: /\b(?:salt|salz|sol|sul)(?![a-z])/,
};

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/gi, "ss")
    .toLowerCase();
}

function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\t|]+/g, " ")
    .replace(/[ ]{2,}/g, " ");
}

function parseNumber(raw: string): number | null {
  let value = raw.replace(/[ \u00a0]/g, "");
  if (value.includes(",") && value.includes(".")) {
    if (value.lastIndexOf(",") > value.lastIndexOf(".")) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  } else {
    value = value.replace(",", ".");
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function gramsFrom(value: number, unit: string): number | null {
  const normalized = unit.toLowerCase();
  if (normalized === "kg") return value * 1000;
  if (normalized === "mg") return value / 1000;
  if (normalized === "g") return value;
  return null;
}

function lineValue(
  lines: string[],
  keyword: RegExp,
  options: {
    skipBeforeValue?: RegExp;
    convert?: (value: number, unit: string) => number | null;
  } = {},
): number | null {
  for (const line of lines) {
    const folded = fold(line);
    const match = folded.match(keyword);
    if (!match || match.index === undefined) continue;

    const rest = line.slice(match.index + match[0].length);
    const firstNumber = rest.search(/\d/);
    if (firstNumber === -1) continue;

    const beforeValue = fold(rest.slice(0, firstNumber));
    if (options.skipBeforeValue?.test(beforeValue)) continue;

    const hit = new RegExp(VALUE_WITH_UNIT, "i").exec(rest);
    if (!hit) continue;
    const rawValue = hit[1];
    const rawUnit = hit[2];
    if (!rawValue || !rawUnit) continue;
    const value = parseNumber(rawValue);
    if (value === null) continue;
    return options.convert
      ? options.convert(value, rawUnit)
      : value;
  }
  return null;
}

function extractEnergy(lines: string[]): {
  kcal: number | null;
  kj: number | null;
} {
  let kcal: number | null = null;
  let kj: number | null = null;

  const read = (source: string[]) => {
    for (const line of source) {
      for (const hit of line.matchAll(new RegExp(VALUE_WITH_UNIT, "gi"))) {
        const rawValue = hit[1];
        const rawUnit = hit[2];
        if (!rawValue || !rawUnit) continue;
        const value = parseNumber(rawValue);
        if (value === null) continue;
        const unit = rawUnit.toLowerCase();
        if (unit === "kcal" && kcal === null) kcal = value;
        if (unit === "kj" && kj === null) kj = value;
      }
      if (kcal !== null && kj !== null) return;
    }
  };

  const energyLines = lines.filter((line) => ENERGY_WORDS.test(fold(line)));
  read(energyLines);
  if (kcal === null || kj === null) read(lines);

  if (kcal === null && kj !== null) {
    kcal = roundTo(kj / KJ_PER_KCAL, 1);
  }
  if (kj === null && kcal !== null) {
    kj = roundTo(kcal * KJ_PER_KCAL, 0);
  }
  return { kcal, kj };
}

function detectBasis(text: string): {
  basisType: BasisType | null;
  servingSize: number | null;
  servingUnit: "g" | "ml" | null;
} {
  const flat = fold(text).replace(/\s+/g, " ");

  const per100 =
    /\b(?:per|na|pro|por)\s*100\s*(g|ml)\b/.exec(flat) ??
    /\b100\s*(g|ml)\b/.exec(flat);
  if (per100) {
    const unit = per100[1];
    if (!unit) return { basisType: null, servingSize: null, servingUnit: null };
    return {
      basisType: unit === "ml" ? "100ml" : "100g",
      servingSize: null,
      servingUnit: null,
    };
  }

  if (
    /\b(?:per serving|na porciu|na porci|na porce|porci|porce|serving size|porcia)\b/.test(
      flat,
    )
  ) {
    const serving = new RegExp(
      String.raw`\b(?:porcia|porciu|porci|porce|serving(?:\s+size)?)\b[^0-9]{0,24}(${NUMBER})\s*(g|ml)\b`,
      "i",
    ).exec(flat);
    const servingValue = serving?.[1];
    const servingUnit = serving?.[2];
    return {
      basisType: "serving",
      servingSize: servingValue ? parseNumber(servingValue) : null,
      servingUnit:
        servingUnit === "ml" ? "ml" : servingUnit === "g" ? "g" : null,
    };
  }

  return { basisType: null, servingSize: null, servingUnit: null };
}

function detectPackage(text: string): {
  packageQuantity: number | null;
  packageUnit: "g" | "ml" | null;
} {
  const flat = fold(text).replace(/\s+/g, " ");
  const patterns = [
    /\b(?:net\s*(?:weight|content|quantity)|netto(?:gewicht)?)\b[^0-9]{0,24}(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/,
    /\b(?:hmotnost|balenie|obsah|package(?:\s+weight|\s+size)?)\b[^0-9]{0,24}(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/,
  ];
  for (const pattern of patterns) {
    const hit = pattern.exec(flat);
    if (!hit) continue;
    const rawValue = hit[1];
    const rawUnit = hit[2];
    if (!rawValue || !rawUnit) continue;
    const raw = parseNumber(rawValue);
    if (raw === null) continue;
    const unit = rawUnit.toLowerCase();
    const quantity = unit === "kg" || unit === "l" ? raw * 1000 : raw;
    return {
      packageQuantity: quantity,
      packageUnit: unit === "ml" || unit === "l" ? "ml" : "g",
    };
  }
  return { packageQuantity: null, packageUnit: null };
}

/**
 * Extracts the common nutrition-table rows from OCR text. It deliberately
 * returns only values it found; unknown rows stay absent so the user can fill
 * them in instead of silently saving a guessed number.
 */
export function parseNutritionLabel(text: string): LabelScanResult {
  const cleaned = cleanText(text);
  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const nutrients: Partial<Record<NutrientKey, number>> = {};
  const energy = extractEnergy(lines);
  if (energy.kcal !== null) nutrients.kcal = energy.kcal;
  if (energy.kj !== null) nutrients.kj = energy.kj;

  const gram = (value: number, unit: string) => gramsFrom(value, unit);

  const protein = lineValue(lines, KEYWORDS.protein, { convert: gram });
  if (protein !== null) nutrients.protein = protein;

  const carbs = lineValue(lines, KEYWORDS.carbs, {
    convert: gram,
    skipBeforeValue: /\b(?:sugars|sugar|cukry|cukor|zucker)\b/,
  });
  if (carbs !== null) nutrients.carbs = carbs;

  const sugars = lineValue(lines, KEYWORDS.sugars, { convert: gram });
  if (sugars !== null) nutrients.sugars = sugars;

  const fat = lineValue(lines, KEYWORDS.fat, {
    convert: gram,
    skipBeforeValue: /\b(?:saturat|nasyten|nasycen|gesattigt|of which|z toho|davon)\b/,
  });
  if (fat !== null) nutrients.fat = fat;

  const satFat = lineValue(lines, KEYWORDS.satFat, { convert: gram });
  if (satFat !== null) nutrients.satFat = satFat;

  const fiber = lineValue(lines, KEYWORDS.fiber, { convert: gram });
  if (fiber !== null) nutrients.fiber = fiber;

  let salt = lineValue(lines, KEYWORDS.salt, { convert: gram });
  if (salt === null) {
    const sodium = lineValue(lines, SODIUM_WORDS, { convert: gram });
    if (sodium !== null) salt = roundTo(sodium * 2.5, 4);
  }
  if (salt !== null) nutrients.salt = salt;

  const basis = detectBasis(cleaned);
  const packageInfo = detectPackage(cleaned);
  const matchedKeys = NUTRIENT_KEYS.filter((key) => nutrients[key] !== undefined);

  return {
    ...basis,
    ...packageInfo,
    nutrients,
    matchedKeys,
  };
}
