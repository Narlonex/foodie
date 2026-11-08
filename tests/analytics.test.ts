import { describe, expect, it } from "vitest";
import {
  adherenceStatus,
  buildHeatmap,
  buildMetricSeries,
  buildWeeklyReview,
  currentStreak,
  nutritionQuality,
  proteinByMeal,
  projectGoal,
  rollingAverage,
  simulateWeight,
  topFoods,
  type InsightDay,
} from "@/lib/analytics";
import type { DiaryEntry, Meal, Nutrients } from "@/lib/types";

const TODAY = "2026-11-02";

function nutrients(overrides: Partial<Nutrients> = {}): Nutrients {
  return {
    kcal: null,
    kj: null,
    protein: null,
    carbs: null,
    sugars: null,
    fat: null,
    satFat: null,
    fiber: null,
    salt: null,
    ...overrides,
  };
}

function entry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: "entry-1",
    date: TODAY,
    meal: "breakfast" as Meal,
    foodId: null,
    source: "custom",
    barcode: null,
    name: "Test food",
    brand: null,
    imageUrl: null,
    preparation: "unspecified",
    amount: 100,
    amountUnit: "g",
    loggedAt: `${TODAY}T08:00:00.000Z`,
    basisType: "100g",
    servingSize: null,
    servingUnit: null,
    nutrients: nutrients({ kcal: 100, protein: 10 }),
    energySource: "provided",
    ...overrides,
  };
}

function day(overrides: Partial<InsightDay> = {}): InsightDay {
  return {
    date: TODAY,
    kcal: 2000,
    protein: 150,
    carbs: 200,
    fat: 70,
    fiber: 30,
    sugars: 50,
    satFat: 22,
    salt: 2.5,
    entryCount: 1,
    targetKcal: 2000,
    missingEntries: 0,
    ...overrides,
  };
}

describe("rolling averages", () => {
  it("averages only known values inside the window", () => {
    expect(rollingAverage([100, null, 300], 3)).toEqual([100, 100, 200]);
  });

  it("does not invent a value for a leading gap", () => {
    expect(rollingAverage([null, null, 90], 2)).toEqual([null, null, 90]);
  });

  it("keeps the raw value alongside the average in a series", () => {
    const series = buildMetricSeries(
      [
        day({ date: "2026-11-01", kcal: 1800 }),
        day({ date: "2026-11-02", kcal: 2200 }),
      ],
      "kcal",
      7,
    );
    expect(series[0]?.value).toBe(1800);
    expect(series[1]?.average).toBe(2000);
  });
});

describe("adherence status", () => {
  it("distinguishes empty, partial, unscored and scored days", () => {
    expect(adherenceStatus(day({ entryCount: 0 }))).toBe("empty");
    expect(adherenceStatus(day({ kcal: null }))).toBe("partial");
    expect(adherenceStatus(day({ missingEntries: 1 }))).toBe("partial");
    expect(adherenceStatus(day({ targetKcal: null }))).toBe("unscored");
    expect(adherenceStatus(day({ kcal: 2100 }))).toBe("within");
    expect(adherenceStatus(day({ kcal: 1200 }))).toBe("outside");
  });
});

describe("heatmap and streak", () => {
  it("builds twelve complete weeks and marks future days explicitly", () => {
    const weeks = buildHeatmap([day()], TODAY, 12);
    expect(weeks).toHaveLength(12);
    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
    const flat = weeks.flatMap((week) => week.days);
    expect(flat.find((cell) => cell.date === TODAY)?.status).toBe("within");
    expect(
      flat
        .filter((cell) => cell.status === "future")
        .every((cell) => cell.date > TODAY),
    ).toBe(true);
  });

  it("counts a streak through yesterday when today is not logged", () => {
    const days = [
      day({ date: "2026-10-31" }),
      day({ date: "2026-11-01" }),
      day({ date: TODAY, entryCount: 0, kcal: null }),
    ];
    expect(currentStreak(days, TODAY)).toBe(2);
    expect(currentStreak([], TODAY)).toBe(0);
  });
});

describe("weekly review", () => {
  it("averages logged days and compares with the week before", () => {
    const days = [
      day({ date: "2026-10-20", kcal: 1800 }),
      day({ date: "2026-10-21", kcal: 1800 }),
      day({ date: "2026-10-28", kcal: 2000 }),
      day({ date: "2026-10-29", kcal: 2200 }),
      day({ date: TODAY, entryCount: 0, kcal: null }),
    ];
    const review = buildWeeklyReview(
      days,
      [
        { date: "2026-10-20", weightKg: 80 },
        { date: TODAY, weightKg: 79 },
      ],
      TODAY,
    );
    expect(review.currentAverageKcal).toBe(2100);
    expect(review.previousAverageKcal).toBe(1800);
    expect(review.averageDeltaKcal).toBe(300);
    expect(review.currentLoggedDays).toBe(2);
    expect(review.previousLoggedDays).toBe(2);
    expect(review.hasData).toBe(true);
  });

  it("returns unknown averages rather than zero when nothing was logged", () => {
    const review = buildWeeklyReview([], [], TODAY);
    expect(review.currentAverageKcal).toBeNull();
    expect(review.hasData).toBe(false);
  });
});

describe("meal and food attribution", () => {
  it("averages protein per meal only across days with known protein", () => {
    const meals = proteinByMeal(
      [
        entry({
          id: "a",
          date: "2026-11-01",
          nutrients: nutrients({ protein: 20 }),
        }),
        entry({
          id: "b",
          date: TODAY,
          nutrients: nutrients({ protein: 30 }),
        }),
        entry({ id: "c", date: TODAY, meal: "lunch", nutrients: nutrients() }),
      ],
      TODAY,
      7,
    );
    const breakfast = meals.find((meal) => meal.meal === "breakfast");
    const lunch = meals.find((meal) => meal.meal === "lunch");
    expect(breakfast?.averageGrams).toBe(25);
    expect(breakfast?.loggedDays).toBe(2);
    expect(lunch?.averageGrams).toBeNull();
  });

  it("groups repeated foods, sorts by energy and excludes unknown energy", () => {
    const foods = topFoods(
      [
        entry({
          id: "a",
          name: "Oats",
          brand: "Brand",
          nutrients: nutrients({ kcal: 300 }),
        }),
        entry({
          id: "b",
          name: "Oats",
          brand: "Brand",
          nutrients: nutrients({ kcal: 200 }),
        }),
        entry({
          id: "c",
          name: "Rice",
          nutrients: nutrients({ kcal: 600 }),
        }),
        entry({ id: "d", name: "Mystery", nutrients: nutrients() }),
      ],
      TODAY,
      30,
    );
    expect(foods[0]).toMatchObject({ name: "Rice", kcal: 600, entries: 1 });
    expect(foods[1]).toMatchObject({ name: "Oats", kcal: 500, entries: 2 });
    expect(foods[1]?.share).toBeCloseTo(500 / 1100, 5);
    expect(foods.some((food) => food.name === "Mystery")).toBe(false);
  });
});

describe("nutrition quality", () => {
  it("computes reference percentages and keeps unknown metrics unknown", () => {
    const quality = nutritionQuality([day()], TODAY, 7);
    const fiber = quality.metrics.find((metric) => metric.key === "fiber");
    const sugars = quality.metrics.find((metric) => metric.key === "sugars");
    const satFat = quality.metrics.find((metric) => metric.key === "satFat");
    const salt = quality.metrics.find((metric) => metric.key === "salt");
    expect(fiber?.percent).toBe(100);
    expect(sugars?.percent).toBe(100);
    expect(satFat?.percent).toBe(99);
    expect(salt?.percent).toBe(50);
    expect(quality.knownDays).toBe(1);
    expect(quality.totalDays).toBe(7);
  });

  it("leaves the metric unknown when every logged day lacks it", () => {
    const quality = nutritionQuality(
      [day({ fiber: null, sugars: null, satFat: null, salt: null })],
      TODAY,
      7,
    );
    expect(quality.metrics.every((metric) => metric.average === null)).toBe(
      true,
    );
  });
});

describe("goal projection and simulator", () => {
  it("projects the goal date from a consistent weight trend", () => {
    const weights = [
      { date: "2026-10-05", weightKg: 80 },
      { date: "2026-10-12", weightKg: 79.5 },
      { date: "2026-10-19", weightKg: 79 },
      { date: "2026-10-26", weightKg: 78.5 },
      { date: TODAY, weightKg: 78 },
    ];
    const projection = projectGoal(weights, 75, TODAY);
    expect(projection?.currentKg).toBe(78);
    expect(projection?.changePerWeekKg).toBeCloseTo(-0.5, 2);
    expect(projection?.directionMatches).toBe(true);
    expect(projection?.weeksToGoal).toBeCloseTo(6, 1);
    expect(projection?.targetDate).toBe("2026-12-14");
  });

  it("marks a trend moving away from the goal", () => {
    const projection = projectGoal(
      [
        { date: "2026-10-26", weightKg: 78 },
        { date: TODAY, weightKg: 78.5 },
      ],
      75,
      TODAY,
    );
    expect(projection?.directionMatches).toBe(false);
    expect(projection?.targetDate).toBeNull();
  });

  it("uses 7,700 kcal per kilogram for the simulator", () => {
    expect(simulateWeight(80, 2500, 2000, 4)).toBeCloseTo(78.2, 1);
    expect(simulateWeight(80, 2500, 2500, 4)).toBe(80);
    expect(simulateWeight(80, 2500, 2000, 26)).toBeCloseTo(68.2, 1);
  });
});
