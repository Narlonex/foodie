import type { MeasurementUnit } from "./types";

export type LengthUnit = MeasurementUnit;

export const CM_PER_INCH = 2.54;

export function fromCentimeters(value: number, unit: LengthUnit): number {
  return unit === "in" ? value / CM_PER_INCH : value;
}

export function toCentimeters(value: number, unit: LengthUnit): number {
  return unit === "in" ? value * CM_PER_INCH : value;
}
