export interface ImportedIngredient {
  /** The original recipe line, kept for review. */
  text: string;
  /** A cleaned search phrase, without the leading quantity and unit. */
  name: string;
  /** Only mass/volume values are returned; cups and spoons are not guessed. */
  amount: number | null;
  unit: "g" | "ml" | null;
}

export interface ImportedRecipe {
  name: string;
  servings: number | null;
  ingredients: ImportedIngredient[];
  sourceUrl: string;
}

const FRACTIONS: Record<string, string> = {
  "½": " 1/2",
  "⅓": " 1/3",
  "⅔": " 2/3",
  "¼": " 1/4",
  "¾": " 3/4",
  "⅕": " 1/5",
  "⅖": " 2/5",
  "⅗": " 3/5",
  "⅘": " 4/5",
  "⅙": " 1/6",
  "⅚": " 5/6",
  "⅛": " 1/8",
  "⅜": " 3/8",
  "⅝": " 5/8",
  "⅞": " 7/8",
};

const MASS_UNITS: Record<string, { unit: "g" | "ml"; factor: number }> = {
  g: { unit: "g", factor: 1 },
  gram: { unit: "g", factor: 1 },
  grams: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  kilogram: { unit: "g", factor: 1000 },
  kilograms: { unit: "g", factor: 1000 },
  mg: { unit: "g", factor: 0.001 },
  ml: { unit: "ml", factor: 1 },
  milliliter: { unit: "ml", factor: 1 },
  milliliters: { unit: "ml", factor: 1 },
  millilitre: { unit: "ml", factor: 1 },
  millilitres: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  liter: { unit: "ml", factor: 1000 },
  liters: { unit: "ml", factor: 1000 },
  litre: { unit: "ml", factor: 1000 },
  litres: { unit: "ml", factor: 1000 },
  oz: { unit: "g", factor: 28.3495 },
  ounce: { unit: "g", factor: 28.3495 },
  ounces: { unit: "g", factor: 28.3495 },
  lb: { unit: "g", factor: 453.592 },
  lbs: { unit: "g", factor: 453.592 },
  pound: { unit: "g", factor: 453.592 },
  pounds: { unit: "g", factor: 453.592 },
};

function parseNumber(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const mixed = /^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/.exec(trimmed);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (![whole, numerator, denominator].every(Number.isFinite) || denominator === 0) {
      return null;
    }
    return whole + numerator / denominator;
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(trimmed);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : numerator / denominator;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Extracts only safe, mass/volume quantities from an ingredient line. */
export function parseIngredientLine(raw: string): ImportedIngredient {
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-•*]+/, "")
    .trim();
  let normalized = text;
  for (const [fraction, replacement] of Object.entries(FRACTIONS)) {
    normalized = normalized.split(fraction).join(replacement);
  }
  normalized = normalized.replace(/\s+/g, " ").trim();

  const quantity =
    /^((?:\d+(?:[.,]\d+)?\s+)?\d+\/\d+|\d+(?:[.,]\d+)?)\s*(.*)$/.exec(
      normalized,
    );
  if (!quantity) {
    return { text, name: text, amount: null, unit: null };
  }
  const parsedAmount = parseNumber(quantity[1] ?? "");
  const remainder = (quantity[2] ?? "").trim();
  const unitMatch = /^([A-Za-zÀ-ž.]+)\s+(.*)$/.exec(remainder);
  const unitToken = unitMatch?.[1]?.toLowerCase().replace(/\.$/, "") ?? "";
  const mapped = MASS_UNITS[unitToken];
  const name = (mapped ? (unitMatch?.[2] ?? "") : remainder)
    .trim()
    .replace(/^[,;:-]\s*/, "");

  return {
    text,
    name,
    amount: mapped && parsedAmount !== null ? Math.round(parsedAmount * mapped.factor * 1000) / 1000 : null,
    unit: mapped?.unit ?? null,
  };
}

function firstRecipe(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((entry) => String(entry).toLowerCase() === "recipe")) {
    return object;
  }
  if (object["@graph"]) {
    return firstRecipe(object["@graph"], depth + 1);
  }
  return null;
}

function parseServings(value: unknown): number | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "number") return Number.isFinite(first) && first > 0 ? Math.round(first) : null;
  if (typeof first !== "string") return null;
  const match = /(\d+(?:[.,]\d+)?)/.exec(first);
  if (!match) return null;
  const parsed = Number(match[1]?.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 200) : "";
}

/** Parses schema.org Recipe JSON-LD out of a normal recipe page. */
export function parseRecipeHtml(html: string, sourceUrl: string): ImportedRecipe | null {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const script of scripts) {
    const json = script[1];
    if (!json) continue;
    try {
      const parsed: unknown = JSON.parse(json);
      const recipe = firstRecipe(parsed);
      if (!recipe) continue;
      const rawIngredients = Array.isArray(recipe.recipeIngredient)
        ? recipe.recipeIngredient
        : Array.isArray(recipe.ingredients)
          ? recipe.ingredients
          : [];
      const ingredients = rawIngredients
        .filter((item): item is string => typeof item === "string")
        .map(parseIngredientLine)
        .filter((ingredient) => ingredient.name.length > 0)
        .slice(0, 80);
      const name = cleanName(recipe.name);
      if (!name || ingredients.length === 0) continue;
      return {
        name,
        servings: parseServings(recipe.recipeYield),
        ingredients,
        sourceUrl,
      };
    } catch {
      // Ignore malformed JSON-LD and try the next script.
    }
  }
  return null;
}
