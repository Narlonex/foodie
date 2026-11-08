import { describe, expect, it } from "vitest";
import {
  CM_PER_INCH,
  fromCentimeters,
  toCentimeters,
} from "@/lib/measurements";

describe("measurement unit conversion", () => {
  it("keeps centimetres unchanged", () => {
    expect(toCentimeters(80, "cm")).toBe(80);
    expect(fromCentimeters(80, "cm")).toBe(80);
  });

  it("converts inches to centimetres and back", () => {
    expect(CM_PER_INCH).toBe(2.54);
    expect(toCentimeters(30, "in")).toBeCloseTo(76.2, 5);
    expect(fromCentimeters(76.2, "in")).toBeCloseTo(30, 5);
  });
});
