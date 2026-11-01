import { recipeNutrition } from "./recipes";
import { storageRound } from "./nutrition";
import type { Food, Nutrients, SavedMeal } from "./types";

export interface MacroGaps {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface MacroSuggestion {
  kind: "food" | "recipe";
  id: string;
  name: string;
  amount: number;
  unit: "g" | "ml";
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  score: number;
}

interface Candidate {
  kind: "food" | "recipe";
  id: string;
  name: string;
  unit: "g" | "ml";
  per100: Nutrients;
  favorite: boolean;
  reference: Food | SavedMeal;
}

const MACRO_WEIGHT = { protein: 2.4, carbs: 1.1, fat: 0.8 } as const;

function usable(nutrients: Nutrients): boolean {
  return (
    nutrients.kcal !== null &&
    nutrients.kcal > 0 &&
    (nutrients.protein !== null ||
      nutrients.carbs !== null ||
      nutrients.fat !== null)
  );
}

function candidatePortions(gaps: MacroGaps, per100: Nutrients): number[] {
  if (gaps.kcal === null) return [100, 150, 200];
  const cap = gaps.kcal > 0 ? gaps.kcal * 0.95 : null;
  const kcalPer100 = per100.kcal;
  const portions: number[] = [];
  for (let grams = 50; grams <= 400; grams += 25) {
    if (kcalPer100 === null) break;
    if (cap !== null && (kcalPer100 * grams) / 100 > cap) continue;
    portions.push(grams);
  }
  if (portions.length === 0) {
    if (kcalPer100 !== null && cap !== null && (kcalPer100 * 50) / 100 <= cap) {
      return [50];
    }
    return [];
  }
  // Prefer a real portion, not a token 50 g when more food still fits.
  return portions.slice(-4);
}

function scorePortion(
  per100: Nutrients,
  grams: number,
  gaps: MacroGaps,
): { score: number; kcal: number; protein: number | null; carbs: number | null; fat: number | null } | null {
  if (per100.kcal === null) return null;
  const factor = grams / 100;
  const kcal = per100.kcal * factor;
  if (gaps.kcal !== null && gaps.kcal > 0 && kcal > gaps.kcal) return null;
  let score = 0;
  let knownGaps = 0;
  const scaled = {
    protein: per100.protein === null ? null : per100.protein * factor,
    carbs: per100.carbs === null ? null : per100.carbs * factor,
    fat: per100.fat === null ? null : per100.fat * factor,
  };
  for (const key of ["protein", "carbs", "fat"] as const) {
    const gap = gaps[key];
    const value = scaled[key];
    if (gap === null || gap <= 0 || value === null) continue;
    knownGaps += 1;
    const coverage = Math.min(1.25, value / gap);
    score += coverage * MACRO_WEIGHT[key];
    // A little extra is useful; a large overshoot of one macro is not.
    if (value > gap * 1.5) score -= 0.8;
  }
  if (knownGaps === 0) return null;
  // Protein is usually the hard target; reward a meaningful absolute amount.
  if ((gaps.protein ?? 0) > 0 && scaled.protein !== null) {
    score += Math.min(1.2, scaled.protein / 30) * 0.7;
  }
  if (gaps.kcal !== null && gaps.kcal > 0) {
    score += Math.min(1, kcal / gaps.kcal) * 0.35;
  }
  return {
    score: Math.round(score * 1000) / 1000,
    kcal: storageRound(kcal),
    protein: scaled.protein === null ? null : storageRound(scaled.protein),
    carbs: scaled.carbs === null ? null : storageRound(scaled.carbs),
    fat: scaled.fat === null ? null : storageRound(scaled.fat),
  };
}

/**
 * Suggests real foods and saved recipes that fit the remaining targets.
 *
 * Unknown nutrient values stay unknown and are never treated as zero. A food
 * is only suggested for a known gap, and only when the chosen portion does not
 * push calories past the remaining budget. Favorites get a small tie-break
 * bonus rather than overriding nutrition.
 */
export function suggestMacroFoods({
  gaps,
  foods,
  recipes = [],
  favoriteIds = [],
  limit = 3,
}: {
  gaps: MacroGaps;
  foods: Food[];
  recipes?: SavedMeal[];
  favoriteIds?: string[];
  limit?: number;
}): MacroSuggestion[] {
  if (
    (gaps.kcal !== null && gaps.kcal <= 0) &&
    (gaps.protein === null || gaps.protein <= 0) &&
    (gaps.carbs === null || gaps.carbs <= 0) &&
    (gaps.fat === null || gaps.fat <= 0)
  ) {
    return [];
  }
  const favorites = new Set(favoriteIds);
  const candidates: Candidate[] = [];
  for (const food of foods) {
    if (!food.id) continue;
    if (food.basisType !== "100g" && food.basisType !== "100ml") continue;
    if (!usable(food.nutrients)) continue;
    candidates.push({
      kind: "food",
      id: food.id,
      name: food.name,
      unit: food.basisType === "100ml" ? "ml" : "g",
      per100: food.nutrients,
      favorite: favorites.has(food.id),
      reference: food,
    });
  }
  for (const recipe of recipes) {
    const summary = recipeNutrition(
      recipe.items.map((item) => ({
        food: item.food,
        amount: item.amount,
        amountUnit: item.amountUnit,
      })),
      recipe.finalWeightG,
      recipe.servings,
    );
    if (!summary.per100g || !usable(summary.per100g)) continue;
    candidates.push({
      kind: "recipe",
      id: recipe.id,
      name: recipe.name,
      unit: "g",
      per100: summary.per100g,
      favorite: false,
      reference: recipe,
    });
  }

  const suggestions: MacroSuggestion[] = [];
  for (const candidate of candidates) {
    let best: MacroSuggestion | null = null;
    for (const grams of candidatePortions(gaps, candidate.per100)) {
      const scored = scorePortion(candidate.per100, grams, gaps);
      if (!scored) continue;
      const total = scored.score + (candidate.favorite ? 0.18 : 0);
      if (!best || total > best.score) {
        best = {
          kind: candidate.kind,
          id: candidate.id,
          name: candidate.name,
          amount: grams,
          unit: candidate.unit,
          kcal: scored.kcal,
          protein: scored.protein,
          carbs: scored.carbs,
          fat: scored.fat,
          score: total,
        };
      }
    }
    if (best) suggestions.push(best);
  }

  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
  return suggestions.slice(0, Math.max(0, limit));
}
