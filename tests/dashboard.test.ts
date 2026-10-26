import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_NUTRIENTS,
  isDashboardNutrient,
  normaliseDashboardNutrients,
} from "@/lib/dashboard";

describe("dashboard nutrient preferences", () => {
  it("keeps the canonical order regardless of stored order", () => {
    expect(normaliseDashboardNutrients(["salt", "protein", "kcal"])).toEqual([
      "kcal",
      "protein",
      "salt",
    ]);
  });

  it("always keeps calories visible", () => {
    expect(normaliseDashboardNutrients(["fiber"])).toEqual(["kcal", "fiber"]);
  });

  it("falls back to defaults when nothing usable was saved", () => {
    expect(normaliseDashboardNutrients([])).toEqual([
      ...DEFAULT_DASHBOARD_NUTRIENTS,
    ]);
  });

  it("drops unknown keys and falls back to defaults when nothing is left", () => {
    expect(normaliseDashboardNutrients(["nope", "sugars"])).toEqual([
      "kcal",
      "sugars",
    ]);
    expect(normaliseDashboardNutrients(["nope"])).toEqual([
      ...DEFAULT_DASHBOARD_NUTRIENTS,
    ]);
    expect(normaliseDashboardNutrients(null)).toEqual([
      ...DEFAULT_DASHBOARD_NUTRIENTS,
    ]);
  });

  it("recognises only supported nutrients", () => {
    expect(isDashboardNutrient("fiber")).toBe(true);
    expect(isDashboardNutrient("satFat")).toBe(false);
    expect(isDashboardNutrient(3)).toBe(false);
  });
});
