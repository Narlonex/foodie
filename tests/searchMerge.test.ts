import { describe, expect, it } from "vitest";
import { mergeSearchResults, normalizeFoodName } from "@/lib/foods/merge";
import { EMPTY_NUTRIENTS, type FoodCandidate, type FoodSource } from "@/lib/types";

function candidate(
  source: FoodSource,
  externalId: string,
  name: string,
): FoodCandidate {
  return {
    source,
    externalId,
    barcode: null,
    name,
    brand: null,
    basisType: "100g",
    servingSize: null,
    servingUnit: null,
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 100 },
    energySource: "provided",
    imageUrl: null,
    preparation: "unspecified",
    packageQuantity: null,
    packageUnit: null,
    drainedWeight: null,
  };
}

describe("normalizeFoodName", () => {
  it("strips case, accents and punctuation", () => {
    expect(normalizeFoodName("Kuracie PRSIA, raw")).toBe("kuracie prsia raw");
    expect(normalizeFoodName("Crème fraîche")).toBe("creme fraiche");
  });
});

describe("mergeSearchResults", () => {
  it("puts the closest name match first regardless of source", () => {
    const off = [candidate("off", "1", "Chicken breast chunks in sauce")];
    const usda = [candidate("usda", "2", "Chicken breast")];

    const merged = mergeSearchResults(off, usda, "chicken breast");

    expect(merged.map((food) => food.name)).toEqual([
      "Chicken breast",
      "Chicken breast chunks in sauce",
    ]);
    expect(merged[0]?.source).toBe("usda");
  });

  it("keeps rows from both databases when the list is capped", () => {
    const off = Array.from({ length: 10 }, (_, index) =>
      candidate("off", `off-${index}`, `Chicken breast product ${index}`),
    );
    const usda = Array.from({ length: 10 }, (_, index) =>
      candidate("usda", `usda-${index}`, `Chicken, broilers or fryers ${index}`),
    );

    const merged = mergeSearchResults(off, usda, "chicken", 6);

    expect(merged).toHaveLength(6);
    expect(merged.some((food) => food.source === "off")).toBe(true);
    expect(merged.some((food) => food.source === "usda")).toBe(true);
  });

  it("drops duplicate records that share a source and id", () => {
    const off = [
      candidate("off", "same", "Oats"),
      candidate("off", "same", "Oats"),
    ];

    expect(mergeSearchResults(off, [], "oats")).toHaveLength(1);
  });

  it("returns an empty list when both sources are empty", () => {
    expect(mergeSearchResults([], [], "quinoa")).toEqual([]);
  });
});
