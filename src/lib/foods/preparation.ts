import type { Preparation } from "../types";

/**
 * Preparation is only ever read from words the source actually prints. A food
 * that merely looks like it might be cooked (a category, a brand, a dish name)
 * stays "unspecified" — guessing here would mislabel raw and cooked variants of
 * the same ingredient, which carry very different nutrient values.
 */
const RAW_TERMS = ["raw", "uncooked", "surove", "surovy", "surová", "syrové"];

const COOKED_TERMS = [
  "cooked",
  "boiled",
  "grilled",
  "roasted",
  "baked",
  "fried",
  "deep-fried",
  "pan-fried",
  "steamed",
  "braised",
  "poached",
  "broiled",
  "toasted",
  "sauteed",
  "sautéed",
  "smoked",
  "varené",
  "varený",
  "varená",
  "pečené",
  "pečený",
  "grilované",
  "grilovaný",
  "údené",
  "údený",
  "vyprážané",
  "smažené",
  "parené",
  "restované",
];

function containsWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

export function detectPreparation(name: string): Preparation {
  const text = name.toLowerCase();
  const raw = RAW_TERMS.some((term) => containsWord(text, term));
  const cooked = COOKED_TERMS.some((term) => containsWord(text, term));
  // A name that claims both ("raw chicken, cooked weight") is ambiguous, so it
  // is reported as unspecified instead of picking a side.
  if (raw && !cooked) return "raw";
  if (cooked && !raw) return "cooked";
  return "unspecified";
}
