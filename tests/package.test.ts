import { describe, expect, it } from "vitest";
import {
  packageToAmount,
  parsePackageCount,
  parsePackageSize,
} from "@/lib/package";

describe("parsePackageSize", () => {
  it("reads grams and millilitres", () => {
    expect(parsePackageSize("400 g")).toEqual({ quantity: 400, unit: "g" });
    expect(parsePackageSize("500ml")).toEqual({ quantity: 500, unit: "ml" });
  });

  it("converts kilograms, litres and centilitres", () => {
    expect(parsePackageSize("1,5 kg")).toEqual({ quantity: 1500, unit: "g" });
    expect(parsePackageSize("1 l")).toEqual({ quantity: 1000, unit: "ml" });
    expect(parsePackageSize("33 cl")).toEqual({ quantity: 330, unit: "ml" });
  });

  it("multiplies multipacks", () => {
    expect(parsePackageSize("6 x 125 g")).toEqual({ quantity: 750, unit: "g" });
    expect(parsePackageSize("2 × 33 cl")).toEqual({ quantity: 660, unit: "ml" });
  });

  it("ignores the estimated markers Open Food Facts appends", () => {
    expect(parsePackageSize("400 g e")).toEqual({ quantity: 400, unit: "g" });
    expect(parsePackageSize("≈ 400 g")).toEqual({ quantity: 400, unit: "g" });
    expect(parsePackageSize("1,5 kg e")).toEqual({ quantity: 1500, unit: "g" });
  });

  it("returns null when there is no usable size", () => {
    expect(parsePackageSize("about 400")).toBeNull();
    expect(parsePackageSize("400")).toBeNull();
    expect(parsePackageSize("0 g")).toBeNull();
    expect(parsePackageSize("")).toBeNull();
    expect(parsePackageSize(null)).toBeNull();
  });
});

describe("parsePackageCount", () => {
  it("accepts decimals with a dot or a comma", () => {
    expect(parsePackageCount("0.5")).toBe(0.5);
    expect(parsePackageCount("1,5")).toBe(1.5);
  });

  it("accepts fractions and mixed numbers", () => {
    expect(parsePackageCount("1/3")).toBeCloseTo(0.333, 3);
    expect(parsePackageCount("2 1/2")).toBe(2.5);
  });

  it("rejects empty, non-numeric, zero and negative input", () => {
    expect(parsePackageCount("")).toBeNull();
    expect(parsePackageCount("abc")).toBeNull();
    expect(parsePackageCount("0")).toBeNull();
    expect(parsePackageCount("-1")).toBeNull();
    expect(parsePackageCount("1/0")).toBeNull();
    expect(parsePackageCount("Infinity")).toBeNull();
  });
});

describe("packageToAmount", () => {
  it("turns a fraction of a package into grams", () => {
    expect(packageToAmount(1 / 3, { quantity: 300, unit: "g" })).toEqual({
      amount: 100,
      unit: "g",
    });
  });

  it("does not lose precision on a typed third of a package", () => {
    expect(packageToAmount(parsePackageCount("1/3"), { quantity: 450, unit: "g" })).toEqual({
      amount: 150,
      unit: "g",
    });
  });

  it("keeps millilitre packages in millilitres", () => {
    expect(packageToAmount(1.5, { quantity: 330, unit: "ml" })).toEqual({
      amount: 495,
      unit: "ml",
    });
  });

  it("returns null without a package size or a valid count", () => {
    expect(packageToAmount(1, null)).toBeNull();
    expect(packageToAmount(null, { quantity: 300, unit: "g" })).toBeNull();
    expect(packageToAmount(0, { quantity: 300, unit: "g" })).toBeNull();
  });
});
