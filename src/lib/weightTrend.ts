import { addDays, isValidIsoDate } from "./dates";
import { GOAL_FACTORS } from "./macroTargets";
import { roundTo } from "./nutrition";
import type { GoalMode } from "./types";

/** Kilocalories stored in one kilogram of body-weight change (approximation). */
export const KCAL_PER_KG_BODY_WEIGHT = 7700;

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export interface IntakeDay {
  date: string;
  kcal: number | null;
  entryCount: number;
}

export interface WeightTrend {
  first: WeightPoint;
  last: WeightPoint;
  changeKg: number;
  changePerWeekKg: number;
  slopeKgPerDay: number;
  points: number;
  spanDays: number;
}

export interface AdaptiveCheckInInput {
  weights: WeightPoint[];
  intake: IntakeDay[];
  goalMode: GoalMode;
  today: string;
  periodDays?: number;
}

export type AdaptiveCheckIn =
  | {
      status: "insufficient";
      weightEntries: number;
      intakeDays: number;
      spanDays: number;
      periodDays: number;
      needsWeights: boolean;
      needsIntake: boolean;
      needsSpan: boolean;
    }
  | {
      status: "implausible";
      averageIntakeKcal: number;
      estimatedTdeeKcal: number;
      weightChangePerWeekKg: number;
      weightEntries: number;
      intakeDays: number;
      spanDays: number;
      periodDays: number;
    }
  | {
      status: "ok";
      averageIntakeKcal: number;
      estimatedTdeeKcal: number;
      suggestedKcal: number;
      weightChangePerWeekKg: number;
      weightEntries: number;
      intakeDays: number;
      spanDays: number;
      periodDays: number;
      confidence: "low" | "good";
    };

const MIN_WEIGHTS = 5;
const MIN_INTAKE_DAYS = 7;
const MIN_SPAN_DAYS = 10;
const MAX_REASONABLE_TDEE = 6_000;
const MIN_REASONABLE_TDEE = 1_000;

function validWeight(point: WeightPoint): boolean {
  return (
    isValidIsoDate(point.date) &&
    Number.isFinite(point.weightKg) &&
    point.weightKg >= 20 &&
    point.weightKg <= 500
  );
}

function dayIndex(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

function sortedWeights(points: WeightPoint[]): WeightPoint[] {
  return points
    .filter(validWeight)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Least-squares weight trend over the supplied points. */
export function calculateWeightTrend(points: WeightPoint[]): WeightTrend | null {
  const sorted = sortedWeights(points);
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  const spanDays = dayIndex(last.date) - dayIndex(first.date);
  if (spanDays <= 0) return null;

  const xs = sorted.map((point) => dayIndex(point.date) - dayIndex(first.date));
  const ys = sorted.map((point) => point.weightKg);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = (xs[index] ?? 0) - meanX;
    numerator += dx * ((ys[index] ?? 0) - meanY);
    denominator += dx * dx;
  }
  const slopeKgPerDay = denominator > 0 ? numerator / denominator : 0;

  return {
    first,
    last,
    changeKg: roundTo(last.weightKg - first.weightKg, 2),
    changePerWeekKg: roundTo(slopeKgPerDay * 7, 2),
    slopeKgPerDay,
    points: sorted.length,
    spanDays,
  };
}

/**
 * Estimates maintenance calories from logged intake and the weight trend.
 *
 * Only days with a real diary entry and a known calorie total count towards the
 * average. Empty days are unknown, not zero. The estimate is intentionally
 * conservative: it refuses to speak when there is too little data, and marks an
 * out-of-range result as implausible instead of turning it into a target.
 */
export function calculateAdaptiveCheckIn(
  input: AdaptiveCheckInInput,
): AdaptiveCheckIn {
  const periodDays = input.periodDays ?? 21;
  const start = addDays(input.today, -(periodDays - 1));
  const weights = sortedWeights(
    input.weights.filter(
      (point) => point.date >= start && point.date <= input.today,
    ),
  );
  const intake = input.intake.filter(
    (day) =>
      day.date >= start &&
      day.date <= input.today &&
      day.entryCount > 0 &&
      day.kcal !== null &&
      Number.isFinite(day.kcal) &&
      day.kcal > 0,
  );
  const trend = calculateWeightTrend(weights);
  const spanDays = trend?.spanDays ?? 0;

  const needsWeights = weights.length < MIN_WEIGHTS;
  const needsIntake = intake.length < MIN_INTAKE_DAYS;
  const needsSpan = spanDays < MIN_SPAN_DAYS;
  if (needsWeights || needsIntake || needsSpan || trend === null) {
    return {
      status: "insufficient",
      weightEntries: weights.length,
      intakeDays: intake.length,
      spanDays,
      periodDays,
      needsWeights,
      needsIntake,
      needsSpan,
    };
  }

  const averageIntakeKcal = roundTo(
    intake.reduce((sum, day) => sum + (day.kcal ?? 0), 0) / intake.length,
    0,
  );
  const estimatedTdeeKcal = roundTo(
    averageIntakeKcal - trend.slopeKgPerDay * KCAL_PER_KG_BODY_WEIGHT,
    0,
  );

  if (
    estimatedTdeeKcal < MIN_REASONABLE_TDEE ||
    estimatedTdeeKcal > MAX_REASONABLE_TDEE
  ) {
    return {
      status: "implausible",
      averageIntakeKcal,
      estimatedTdeeKcal,
      weightChangePerWeekKg: trend.changePerWeekKg,
      weightEntries: weights.length,
      intakeDays: intake.length,
      spanDays,
      periodDays,
    };
  }

  const suggestedKcal = Math.max(
    1_200,
    Math.round((estimatedTdeeKcal * GOAL_FACTORS[input.goalMode]) / 10) * 10,
  );

  return {
    status: "ok",
    averageIntakeKcal,
    estimatedTdeeKcal,
    suggestedKcal,
    weightChangePerWeekKg: trend.changePerWeekKg,
    weightEntries: weights.length,
    intakeDays: intake.length,
    spanDays,
    periodDays,
    confidence:
      weights.length >= 7 && intake.length >= 10 ? "good" : "low",
  };
}
