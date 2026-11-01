import { describe, expect, it } from "vitest";
import {
  calculateAdaptiveCheckIn,
  calculateWeightTrend,
  type IntakeDay,
  type WeightPoint,
} from "@/lib/weightTrend";
import { addDays } from "@/lib/dates";

const today = "2026-11-01";

function points(count: number, stepDays: number, startWeight: number, lossPerDay: number): WeightPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    date: addDays(today, -(count - 1 - index) * stepDays),
    weightKg: Math.round((startWeight - index * stepDays * lossPerDay) * 10) / 10,
  }));
}

function intake(count: number, kcal: number): IntakeDay[] {
  return Array.from({ length: count }, (_, index) => ({
    date: addDays(today, -(count - 1 - index)),
    kcal,
    entryCount: 3,
  }));
}

describe("weight trend", () => {
  it("finds a stable least-squares trend and ignores invalid points", () => {
    const weights = points(8, 3, 82, 0.05);
    const trend = calculateWeightTrend([
      ...weights,
      { date: "not-a-date", weightKg: 10 },
    ]);
    expect(trend).not.toBeNull();
    expect(Math.abs((trend?.slopeKgPerDay ?? 0) + 0.05)).toBeLessThan(0.01);
    expect(trend?.changePerWeekKg).toBeLessThan(0);
    expect(trend?.spanDays).toBe(21);
    expect(trend?.points).toBe(8);
  });

  it("needs at least two different days", () => {
    expect(
      calculateWeightTrend([{ date: today, weightKg: 80 }]),
    ).toBeNull();
    expect(
      calculateWeightTrend([
        { date: today, weightKg: 80 },
        { date: today, weightKg: 79 },
      ]),
    ).toBeNull();
  });
});

describe("adaptive check-in", () => {
  it("estimates maintenance from intake and the weight slope", () => {
    const checkIn = calculateAdaptiveCheckIn({
      weights: points(8, 3, 82, 0.05),
      intake: intake(15, 2000),
      goalMode: "maintenance",
      today,
    });
    expect(checkIn.status).toBe("ok");
    if (checkIn.status === "ok") {
      expect(checkIn.averageIntakeKcal).toBe(2000);
      expect(checkIn.estimatedTdeeKcal).toBe(2385);
      expect(checkIn.weightChangePerWeekKg).toBeCloseTo(-0.35, 2);
      expect(checkIn.suggestedKcal).toBe(2390);
      expect(checkIn.confidence).toBe("good");
    }
  });

  it("ignores empty days instead of counting them as zero", () => {
    const days = intake(14, 2100);
    const checkIn = calculateAdaptiveCheckIn({
      weights: points(7, 3, 80, 0.02),
      intake: [
        ...days,
        ...Array.from({ length: 7 }, (_, index) => ({
          date: addDays(today, -index),
          kcal: null,
          entryCount: 0,
        })),
      ],
      goalMode: "cut",
      today,
    });
    expect(checkIn.status).toBe("ok");
    if (checkIn.status === "ok") expect(checkIn.averageIntakeKcal).toBe(2100);
  });

  it("refuses to guess with too little data", () => {
    const checkIn = calculateAdaptiveCheckIn({
      weights: points(3, 2, 80, 0.02),
      intake: intake(4, 2000),
      goalMode: "maintenance",
      today,
    });
    expect(checkIn.status).toBe("insufficient");
    if (checkIn.status === "insufficient") {
      expect(checkIn.needsWeights).toBe(true);
      expect(checkIn.needsIntake).toBe(true);
      expect(checkIn.needsSpan).toBe(true);
    }
  });

  it("reports an implausible estimate instead of producing a target", () => {
    const checkIn = calculateAdaptiveCheckIn({
      weights: points(8, 3, 120, 1),
      intake: intake(15, 1500),
      goalMode: "maintenance",
      today,
    });
    expect(checkIn.status).toBe("implausible");
    if (checkIn.status === "implausible") {
      expect(checkIn.estimatedTdeeKcal).toBeGreaterThan(6000);
    }
  });

  it("never suggests less than 1200 kcal", () => {
    const checkIn = calculateAdaptiveCheckIn({
      weights: points(8, 3, 55, -0.01),
      intake: intake(15, 1300),
      goalMode: "cut",
      today,
    });
    expect(checkIn.status).toBe("ok");
    if (checkIn.status === "ok") expect(checkIn.suggestedKcal).toBeGreaterThanOrEqual(1200);
  });
});
