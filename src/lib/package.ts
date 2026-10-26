/**
 * Package helpers. Two separate questions are answered here:
 *  - how big is the package (parsed from a source string such as "6 x 125 g"),
 *  - how much of it the user ate (a fraction, decimal or mixed number).
 *
 * Nothing is guessed: an unparseable or missing package size returns null and
 * the caller must ask the user for a quantity instead.
 */

export interface PackageSize {
  quantity: number;
  unit: "g" | "ml";
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;

function toNumber(value: string): number {
  return Number(value.replace(",", "."));
}

function normaliseUnit(unit: string, value: number): PackageSize | null {
  switch (unit.toLowerCase()) {
    case "g":
      return { quantity: value, unit: "g" };
    case "kg":
      return { quantity: value * 1000, unit: "g" };
    case "ml":
      return { quantity: value, unit: "ml" };
    case "cl":
      return { quantity: value * 10, unit: "ml" };
    case "l":
      return { quantity: value * 1000, unit: "ml" };
    default:
      return null;
  }
}

/**
 * Parses a net quantity such as "400 g", "1,5 kg", "500ml", "6 x 125 g" or
 * "2 × 33 cl". Returns null for anything else, including implausible values.
 */
export function parsePackageSize(raw: string | null | undefined): PackageSize | null {
  if (!raw) return null;
  // Open Food Facts annotates quantities, e.g. "400 g e" (estimated) or
  // "≈ 400 g". Those markers are dropped; the number itself is still printed.
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/[≈~*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+e\s*$/, "")
    .trim();

  const multipack = text.match(
    new RegExp(`^(${NUMBER})\\s*(?:x|×)\\s*(${NUMBER})\\s*([a-z]+)$`),
  );
  if (multipack) {
    const count = toNumber(multipack[1] ?? "0");
    const size = toNumber(multipack[2] ?? "0");
    const unit = multipack[3] ?? "";
    if (count <= 0 || size <= 0 || count > 1000) return null;
    return normaliseUnit(unit, count * size);
  }

  const single = text.match(new RegExp(`^(${NUMBER})\\s*([a-z]+)$`));
  if (single) {
    const size = toNumber(single[1] ?? "0");
    if (!(size > 0)) return null;
    return normaliseUnit(single[2] ?? "", size);
  }

  return null;
}

/**
 * Parses an amount in packages: "0.5", "1,5", "1/3", "2 1/2". Returns null for
 * empty, non-numeric, zero, negative or absurd input.
 */
export function parsePackageCount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim().replace(",", ".").replace(/\s+/g, " ");
  if (text === "") return null;

  let value: number;
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator <= 0 || numerator < 0) return null;
    value = whole + numerator / denominator;
  } else if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator <= 0) return null;
    value = numerator / denominator;
  } else {
    value = Number(text);
  }

  if (!Number.isFinite(value) || value <= 0 || value > 1000) return null;
  // Keep enough precision for one third: rounding here would turn 1/3 of 450 g
  // into 149.85 g instead of 150 g.
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Grams (or millilitres) for a number of packages, or null when unknown. */
export function packageToAmount(
  packs: number | null,
  size: PackageSize | null,
): { amount: number; unit: "g" | "ml" } | null {
  if (packs === null || size === null) return null;
  if (!Number.isFinite(packs) || packs <= 0) return null;
  const amount = Math.round(packs * size.quantity * 1000) / 1000;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, unit: size.unit };
}
