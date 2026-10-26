import type { FoodCandidate, FoodSource } from "../types";

/**
 * Merges results from more than one food database into a single list.
 *
 * Sources are never hidden from each other: the merged list keeps every
 * candidate, ranks the ones whose name matches the query first, and keeps at
 * least one row per source so a provider that scores lower on relevance still
 * shows that it answered.
 */

const SOURCE_ORDER: Record<FoodSource, number> = { off: 0, usda: 1, custom: 2 };

/** Lowercased, accent-free, punctuation-free form used for name comparison. */
export function normalizeFoodName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function relevanceScore(food: FoodCandidate, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  const name = normalizeFoodName(food.name);
  if (!name) return 0;
  if (name === normalizedQuery) return 4;
  if (name.startsWith(normalizedQuery)) return 3;
  if (name.split(" ").includes(normalizedQuery)) return 2;
  if (name.includes(normalizedQuery)) return 1;
  return 0;
}

function candidateKey(food: FoodCandidate): string {
  return `${food.source}:${food.externalId ?? food.barcode ?? food.name}`;
}

function byScore(
  a: { food: FoodCandidate; score: number },
  b: { food: FoodCandidate; score: number },
): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.food.name.length !== b.food.name.length) {
    return a.food.name.length - b.food.name.length;
  }
  const sourceDelta = SOURCE_ORDER[a.food.source] - SOURCE_ORDER[b.food.source];
  if (sourceDelta !== 0) return sourceDelta;
  return a.food.name.localeCompare(b.food.name);
}

export function mergeSearchResults(
  off: FoodCandidate[],
  usda: FoodCandidate[],
  query: string,
  limit = 24,
): FoodCandidate[] {
  const normalizedQuery = normalizeFoodName(query);
  const seen = new Set<string>();
  const scored: { food: FoodCandidate; score: number }[] = [];

  for (const food of [...off, ...usda]) {
    const key = candidateKey(food);
    if (seen.has(key)) continue;
    seen.add(key);
    scored.push({ food, score: relevanceScore(food, normalizedQuery) });
  }

  scored.sort(byScore);
  if (scored.length <= limit) return scored.map((entry) => entry.food);

  const head = scored.slice(0, limit);
  for (const source of ["off", "usda"] as const) {
    if (head.some((entry) => entry.food.source === source)) continue;
    const replacement = scored.find(
      (entry) =>
        entry.food.source === source && !head.includes(entry),
    );
    if (!replacement) continue;
    head.pop();
    head.push(replacement);
  }
  head.sort(byScore);
  return head.map((entry) => entry.food);
}
