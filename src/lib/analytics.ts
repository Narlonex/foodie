import { addDays, startOfWeek } from "./dates";
import { entryPortion, roundTo } from "./nutrition";
import { calculateWeightTrend, KCAL_PER_KG_BODY_WEIGHT } from "./weightTrend";
import { MEALS, type DiaryEntry, type Meal } from "./types";

export type InsightMetric = "kcal" | "protein" | "carbs" | "fat";

export interface InsightDay {
  date: string;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugars: number | null;
  satFat: number | null;
  salt: number | null;
  entryCount: number;
  targetKcal: number | null;
  missingEntries: number;
}

export type AdherenceStatus =
  | "empty"
  | "partial"
  | "within"
  | "outside"
  | "unscored"
  | "future";

export interface HeatmapDay {
  date: string;
  status: AdherenceStatus;
  kcal: number | null;
  targetKcal: number | null;
}

export interface HeatmapWeek {
  days: HeatmapDay[];
}

export interface WeeklyReview {
  currentAverageKcal: number | null;
  previousAverageKcal: number | null;
  averageDeltaKcal: number | null;
  currentLoggedDays: number;
  previousLoggedDays: number;
  withinTargetDays: number;
  weightChangePerWeekKg: number | null;
  weightEntries: number;
  hasData: boolean;
}

export interface MealProtein {
  meal: Meal;
  averageGrams: number | null;
  loggedDays: number;
}

export interface FoodAttribution {
  key: string;
  name: string;
  brand: string | null;
  kcal: number;
  entries: number;
  share: number;
}

export type QualityKey = "fiber" | "sugars" | "satFat" | "salt";

export interface QualityMetric {
  key: QualityKey;
  average: number | null;
  unit: string;
  reference: number;
  percent: number | null;
  mode: "atLeast" | "atMost";
  knownDays: number;
}

export interface QualitySummary {
  metrics: QualityMetric[];
  knownDays: number;
  totalDays: number;
}

export interface GoalProjection {
  currentKg: number;
  goalKg: number | null;
  changePerWeekKg: number | null;
  projectedFourWeeksKg: number | null;
  weeksToGoal: number | null;
  targetDate: string | null;
  directionMatches: boolean;
  points: number;
}

function averageKnown(values: Array<number | null>): number | null {
  const known = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

export function metricValue(day: InsightDay, metric: InsightMetric): number | null {
  return day[metric];
}

export function rollingAverage(
  values: Array<number | null>,
  window = 7,
): Array<number | null> {
  if (window < 1) return values.map(() => null);
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    return averageKnown(values.slice(start, index + 1));
  });
}

export function buildMetricSeries(
  days: InsightDay[],
  metric: InsightMetric,
  window = 7,
): Array<{ date: string; value: number | null; average: number | null }> {
  const values = days.map((day) => metricValue(day, metric));
  const averages = rollingAverage(values, window);
  return days.map((day, index) => ({
    date: day.date,
    value: values[index] ?? null,
    average: averages[index] ?? null,
  }));
}

export function adherenceStatus(day: InsightDay): AdherenceStatus {
  if (day.entryCount === 0) return "empty";
  if (day.kcal === null || day.missingEntries > 0) return "partial";
  if (day.targetKcal === null || day.targetKcal <= 0) return "unscored";
  const ratio = day.kcal / day.targetKcal;
  return ratio >= 0.9 && ratio <= 1.1 ? "within" : "outside";
}

/**
 * Builds 12 calendar weeks ending with the current week. Future days are
 * explicit placeholders so the grid never implies that they were empty.
 */
export function buildHeatmap(
  days: InsightDay[],
  today: string,
  weeks = 12,
): HeatmapWeek[] {
  const start = startOfWeek(addDays(today, -7 * (weeks - 1)));
  const byDate = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length: weeks }, (_, weekIndex) => ({
    days: Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(start, weekIndex * 7 + dayIndex);
      const day = byDate.get(date);
      if (date > today) {
        return {
          date,
          status: "future" as const,
          kcal: null,
          targetKcal: null,
        };
      }
      if (!day) {
        return {
          date,
          status: "empty" as const,
          kcal: null,
          targetKcal: null,
        };
      }
      return {
        date,
        status: adherenceStatus(day),
        kcal: day.kcal,
        targetKcal: day.targetKcal,
      };
    }),
  }));
}

export function currentStreak(days: InsightDay[], today: string): number {
  const byDate = new Map(days.map((day) => [day.date, day]));
  let cursor = today;
  if (!byDate.get(cursor)?.entryCount) cursor = addDays(today, -1);
  let streak = 0;
  for (let index = 0; index < days.length; index += 1) {
    const day = byDate.get(cursor);
    if (!day || day.entryCount === 0) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function averageIntake(days: InsightDay[]): number | null {
  return averageKnown(
    days
      .filter((day) => day.entryCount > 0 && (day.kcal ?? 0) > 0)
      .map((day) => day.kcal),
  );
}

export function buildWeeklyReview(
  days: InsightDay[],
  weights: Array<{ date: string; weightKg: number }>,
  today: string,
): WeeklyReview {
  const currentStart = addDays(today, -6);
  const previousStart = addDays(today, -13);
  const current = days.filter(
    (day) => day.date >= currentStart && day.date <= today,
  );
  const previous = days.filter(
    (day) => day.date >= previousStart && day.date <= addDays(today, -7),
  );
  const currentAverage = averageIntake(current);
  const previousAverage = averageIntake(previous);
  const trend = calculateWeightTrend(
    weights.filter((entry) => entry.date >= previousStart),
  );
  return {
    currentAverageKcal: currentAverage === null ? null : roundTo(currentAverage, 0),
    previousAverageKcal:
      previousAverage === null ? null : roundTo(previousAverage, 0),
    averageDeltaKcal:
      currentAverage !== null && previousAverage !== null
        ? roundTo(currentAverage - previousAverage, 0)
        : null,
    currentLoggedDays: current.filter((day) => day.entryCount > 0).length,
    previousLoggedDays: previous.filter((day) => day.entryCount > 0).length,
    withinTargetDays: current.filter(
      (day) => adherenceStatus(day) === "within",
    ).length,
    weightChangePerWeekKg: trend?.changePerWeekKg ?? null,
    weightEntries: trend?.points ?? 0,
    hasData: current.some((day) => day.entryCount > 0),
  };
}

export function proteinByMeal(
  entries: DiaryEntry[],
  today: string,
  days = 7,
): MealProtein[] {
  const start = addDays(today, -(days - 1));
  const selected = entries.filter(
    (entry) => entry.date >= start && entry.date <= today,
  );
  return MEALS.map((meal) => {
    const byDate = new Map<string, number>();
    for (const entry of selected) {
      if (entry.meal !== meal) continue;
      const protein = entryPortion(entry).nutrients.protein;
      if (protein === null) continue;
      byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + protein);
    }
    const values = Array.from(byDate.values());
    return {
      meal,
      averageGrams:
        values.length === 0
          ? null
          : roundTo(values.reduce((sum, value) => sum + value, 0) / values.length, 1),
      loggedDays: values.length,
    };
  });
}

export function topFoods(
  entries: DiaryEntry[],
  today: string,
  days = 30,
  limit = 6,
): FoodAttribution[] {
  const start = addDays(today, -(days - 1));
  const selected = entries.filter(
    (entry) => entry.date >= start && entry.date <= today,
  );
  const totals = new Map<
    string,
    { name: string; brand: string | null; kcal: number; entries: number }
  >();
  let totalKcal = 0;
  for (const entry of selected) {
    const kcal = entryPortion(entry).nutrients.kcal;
    if (kcal === null || kcal <= 0) continue;
    totalKcal += kcal;
    const key = `${entry.name.trim().toLocaleLowerCase()}|${entry.brand ?? ""}`;
    const existing = totals.get(key);
    if (existing) {
      existing.kcal += kcal;
      existing.entries += 1;
    } else {
      totals.set(key, {
        name: entry.name,
        brand: entry.brand,
        kcal,
        entries: 1,
      });
    }
  }
  return Array.from(totals.entries())
    .map(([key, value]) => ({
      key,
      name: value.name,
      brand: value.brand,
      kcal: roundTo(value.kcal, 0),
      entries: value.entries,
      share: totalKcal > 0 ? value.kcal / totalKcal : 0,
    }))
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, limit);
}

export function nutritionQuality(
  days: InsightDay[],
  today: string,
  window = 7,
): QualitySummary {
  const start = addDays(today, -(window - 1));
  const period = days.filter(
    (day) => day.date >= start && day.date <= today,
  );
  const logged = period.filter((day) => day.entryCount > 0);
  const avgKcal = averageKnown(logged.map((day) => day.kcal));
  const avgFiber = averageKnown(logged.map((day) => day.fiber));
  const avgSugars = averageKnown(logged.map((day) => day.sugars));
  const avgSatFat = averageKnown(logged.map((day) => day.satFat));
  const avgSalt = averageKnown(logged.map((day) => day.salt));
  const sugarPercent =
    avgKcal !== null && avgKcal > 0 && avgSugars !== null
      ? ((avgSugars * 4) / avgKcal) * 100
      : null;
  const satFatPercent =
    avgKcal !== null && avgKcal > 0 && avgSatFat !== null
      ? ((avgSatFat * 9) / avgKcal) * 100
      : null;

  const metric = (
    key: QualityKey,
    average: number | null,
    unit: string,
    reference: number,
    mode: "atLeast" | "atMost",
    percentValue: number | null,
  ): QualityMetric => ({
    key,
    average: average === null ? null : roundTo(average, 1),
    unit,
    reference,
    percent:
      percentValue === null
        ? null
        : Math.max(0, Math.min(150, roundTo(percentValue, 0))),
    mode,
    knownDays: logged.filter((day) => day[key] !== null).length,
  });

  return {
    metrics: [
      metric(
        "fiber",
        avgFiber,
        "g",
        30,
        "atLeast",
        avgFiber === null ? null : (avgFiber / 30) * 100,
      ),
      metric(
        "sugars",
        sugarPercent,
        "%",
        10,
        "atMost",
        sugarPercent === null ? null : (sugarPercent / 10) * 100,
      ),
      metric(
        "satFat",
        satFatPercent,
        "%",
        10,
        "atMost",
        satFatPercent === null ? null : (satFatPercent / 10) * 100,
      ),
      metric(
        "salt",
        avgSalt,
        "g",
        5,
        "atMost",
        avgSalt === null ? null : (avgSalt / 5) * 100,
      ),
    ],
    knownDays: logged.length,
    totalDays: window,
  };
}

export function projectGoal(
  weights: Array<{ date: string; weightKg: number }>,
  goalWeightKg: number | null,
  today: string,
): GoalProjection | null {
  const sorted = weights
    .filter((entry) => Number.isFinite(entry.weightKg))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  if (!latest) return null;
  const trend = calculateWeightTrend(sorted.slice(-60));
  const change = trend?.changePerWeekKg ?? null;
  let weeksToGoal: number | null = null;
  if (goalWeightKg !== null && change !== null && change !== 0) {
    const remaining = goalWeightKg - latest.weightKg;
    const directionMatches =
      (remaining < 0 && change < 0) || (remaining > 0 && change > 0);
    if (directionMatches) {
      weeksToGoal = Math.abs(remaining / change);
    }
  }
  const projectedFourWeeksKg =
    change === null ? null : roundTo(latest.weightKg + change * 4, 1);
  const directionMatches =
    goalWeightKg === null || change === null || goalWeightKg === latest.weightKg
      ? false
      : (goalWeightKg < latest.weightKg && change < 0) ||
        (goalWeightKg > latest.weightKg && change > 0);

  return {
    currentKg: latest.weightKg,
    goalKg: goalWeightKg,
    changePerWeekKg: change,
    projectedFourWeeksKg,
    weeksToGoal:
      weeksToGoal === null ? null : Math.max(0, roundTo(weeksToGoal, 1)),
    targetDate:
      weeksToGoal === null || weeksToGoal <= 0
        ? null
        : addDays(today, Math.round(weeksToGoal * 7)),
    directionMatches,
    points: trend?.points ?? 0,
  };
}

export function simulateWeight(
  currentKg: number,
  maintenanceKcal: number,
  dailyKcal: number,
  weeks: number,
): number {
  const change =
    ((dailyKcal - maintenanceKcal) * 7 * weeks) / KCAL_PER_KG_BODY_WEIGHT;
  return roundTo(currentKg + change, 1);
}

export function averageOfKnown(values: Array<number | null>): number | null {
  return averageKnown(values);
}
