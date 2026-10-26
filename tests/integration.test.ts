import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_NUTRIENTS } from "@/lib/types";
import { entryPortion } from "@/lib/nutrition";

/**
 * These tests need a real PostgreSQL-compatible server. Point
 * FOODIE_TEST_DATABASE_URL at a migrated test database, for example:
 *
 *   FOODIE_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres \
 *     npx vitest run tests/integration.test.ts
 *
 * They are skipped (not failed) when no test database is configured so the
 * default unit-test run stays self-contained.
 */
const connectionString = process.env.FOODIE_TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

if (connectionString) {
  process.env.DATABASE_URL = connectionString;
}

const userA = randomUUID();
const userB = randomUUID();
const emailA = `a-${userA.slice(0, 8)}@foodie.test`;
const emailB = `b-${userB.slice(0, 8)}@foodie.test`;

let db: typeof import("@/lib/db");
let dayTypes: typeof import("@/lib/repositories/dayTypes");
let diary: typeof import("@/lib/repositories/diary");
let foods: typeof import("@/lib/repositories/foods");
let savedMeals: typeof import("@/lib/repositories/savedMeals");

let workoutId = "";
let restId = "";

function foodDraft(
  name: string,
  values: {
    kcal?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
    fiber?: number | null;
    salt?: number | null;
  } = {},
) {
  return {
    source: "custom" as const,
    externalId: null,
    barcode: null,
    name,
    brand: null,
    basisType: "100g" as const,
    servingSize: null,
    servingUnit: null,
    imageUrl: null,
    nutrients: {
      ...EMPTY_NUTRIENTS,
      kcal: values.kcal === undefined ? 380 : values.kcal,
      protein: values.protein === undefined ? 13 : values.protein,
      carbs: values.carbs === undefined ? 60 : values.carbs,
      fat: values.fat === undefined ? 7 : values.fat,
      fiber: values.fiber === undefined ? 10 : values.fiber,
      salt: values.salt === undefined ? null : values.salt,
    },
  };
}

describeDb("database-backed Foodie flows", () => {
  beforeAll(async () => {
    db = await import("@/lib/db");
    dayTypes = await import("@/lib/repositories/dayTypes");
    diary = await import("@/lib/repositories/diary");
    foods = await import("@/lib/repositories/foods");
    savedMeals = await import("@/lib/repositories/savedMeals");

    await db.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'test'), ($3, $4, 'test')`,
      [userA, emailA, userB, emailB],
    );
    await db.query(`INSERT INTO profiles (user_id) VALUES ($1), ($2)`, [
      userA,
      userB,
    ]);

    const workout = await dayTypes.createDayType(userA, {
      name: "Workout Day",
      kcal: 2000,
      protein: 150,
      carbs: 200,
      fat: 66.67,
      adjustmentMode: "all",
      proteinPct: 30,
      carbsPct: 40,
      fatPct: 30,
    });
    const rest = await dayTypes.createDayType(userA, {
      name: "Rest Day",
      kcal: 1800,
      protein: 140,
      carbs: 170,
      fat: 70,
      adjustmentMode: "carbs",
      proteinPct: 30,
      carbsPct: 40,
      fatPct: 30,
    });
    if (!workout.ok || !workout.dayType || !rest.ok || !rest.dayType) {
      throw new Error("Could not create test day types.");
    }
    workoutId = workout.dayType.id;
    restId = rest.dayType.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db
      .query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userA, userB]])
      .catch(() => undefined);
    await db.getPool().end().catch(() => undefined);
  });

  it("creates day types with distinct targets and keeps date assignments", async () => {
    const list = await dayTypes.listDayTypes(userA);
    expect(list.map((type) => type.name)).toEqual(["Rest Day", "Workout Day"]);
    const workout = list.find((type) => type.id === workoutId);
    const rest = list.find((type) => type.id === restId);
    expect(workout?.kcal).toBe(2000);
    expect(workout?.protein).toBe(150);
    expect(rest?.kcal).toBe(1800);
    expect(rest?.protein).toBe(140);
    expect(rest?.fat).toBe(70);
    expect(rest?.carbs).toBeCloseTo(152.5, 2);

    expect(
      await dayTypes.setDayTypeForDate(userA, "2026-10-21", workoutId),
    ).toBe(true);
    expect(await dayTypes.setDayTypeForDate(userA, "2026-10-22", restId)).toBe(
      true,
    );
    const assigned = await dayTypes.getEffectiveDayType(userA, "2026-10-21");
    expect(assigned.dayType?.id).toBe(workoutId);
    expect(assigned.assignedDayTypeId).toBe(workoutId);

    expect(await dayTypes.setDefaultDayType(userA, restId)).toBe(true);
    const fallback = await dayTypes.getEffectiveDayType(userA, "2026-10-23");
    expect(fallback.dayType?.id).toBe(restId);
    expect(fallback.assignedDayTypeId).toBeNull();
  });

  it("does not let another user assign or read a day type", async () => {
    expect(
      await dayTypes.setDayTypeForDate(userB, "2026-10-21", workoutId),
    ).toBe(false);
    expect(await dayTypes.getEffectiveDayType(userB, "2026-10-21")).toEqual({
      dayType: null,
      assignedDayTypeId: null,
    });
    await expect(
      dayTypes.updateDayType(userB, workoutId, {
        name: "Hijacked",
        kcal: 2000,
        protein: 150,
        carbs: 200,
        fat: 66.67,
        adjustmentMode: "all",
        proteinPct: 30,
        carbsPct: 40,
        fatPct: 30,
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(await dayTypes.deleteDayType(userB, workoutId)).toMatchObject({
      ok: false,
      reason: "not-found",
    });
    expect(await dayTypes.setDefaultDayType(userB, restId)).toBe(false);
  });

  it("saves all four manually entered targets exactly and keeps ownership", async () => {
    const created = await dayTypes.createDayType(userB, {
      name: "Manual targets test",
      kcal: 2200,
      protein: 170,
      carbs: 220,
      fat: 73,
      adjustmentMode: "all",
      proteinPct: 30,
      carbsPct: 40,
      fatPct: 30,
    });
    if (!created.ok || !created.dayType) {
      throw new Error("Could not create a day type for manual targets.");
    }
    const id = created.dayType.id;

    const updated = await dayTypes.updateDayTypeTargets(userB, id, {
      kcal: 2450.5,
      protein: 185.25,
      carbs: 245.5,
      fat: 81.75,
    });
    expect(updated).toMatchObject({
      kcal: 2450.5,
      protein: 185.25,
      carbs: 245.5,
      fat: 81.75,
    });
    if (!updated) throw new Error("Manual targets were not saved.");
    expect(
      updated.split.protein + updated.split.carbs + updated.split.fat,
    ).toBeCloseTo(100, 1);
    expect(await dayTypes.updateDayTypeTargets(userA, id, {
      kcal: 1000,
      protein: 10,
      carbs: 10,
      fat: 10,
    })).toBeNull();
    expect(await dayTypes.deleteDayType(userB, id)).toMatchObject({ ok: true });
  });

  it("logs food, scales nutrition and keeps unknown nutrients unknown", async () => {
    const oats = await foods.createCustomFood(userA, foodDraft("Rolled oats"));
    expect(oats.id).toBeTruthy();
    const entry = await diary.logFoodById(
      userA,
      oats.id as string,
      "2026-10-21",
      "breakfast",
      150,
      "g",
    );
    expect(entry.amount).toBe(150);
    expect(entry.nutrients.protein).toBe(13);
    expect(entry.nutrients.salt).toBeNull();

    const day = await diary.getDayTotals(userA, "2026-10-21");
    expect(day.entries).toHaveLength(1);
    expect(day.dayType?.name).toBe("Workout Day");
    expect(day.totals.nutrients.kcal.value).toBe(570);
    expect(day.totals.nutrients.protein.value).toBe(19.5);
    expect(day.totals.nutrients.fiber.value).toBe(15);
    expect(day.totals.nutrients.salt).toEqual({
      value: null,
      knownEntries: 0,
      missingEntries: 1,
    });
  });

  it("recomputes totals after editing and does not alter entries on day type change", async () => {
    const before = await diary.getDayTotals(userA, "2026-10-21");
    const entryId = before.entries[0]?.id;
    if (!entryId) throw new Error("Missing test entry.");

    const updated = await diary.updateEntry(userA, entryId, {
      meal: "lunch",
      amount: 200,
      amountUnit: "g",
    });
    expect(updated?.meal).toBe("lunch");
    const after = await diary.getDayTotals(userA, "2026-10-21");
    expect(after.totals.nutrients.kcal.value).toBe(760);
    expect(after.totals.nutrients.protein.value).toBe(26);

    await dayTypes.setDayTypeForDate(userA, "2026-10-21", restId);
    const restDay = await diary.getDayTotals(userA, "2026-10-21");
    expect(restDay.dayType?.name).toBe("Rest Day");
    expect(restDay.entries).toEqual(after.entries);
    expect(restDay.totals.nutrients.kcal.value).toBe(760);

    await dayTypes.setDayTypeForDate(userA, "2026-10-21", workoutId);
    await dayTypes.setDayTypeForDate(userA, "2026-10-22", restId);
  });

  it("copies a day with quantities and protects existing destinations", async () => {
    const preview = await diary.previewCopyDay(
      userA,
      "2026-10-21",
      "2026-10-24",
    );
    expect(preview).toMatchObject({
      sourceCount: 1,
      targetCount: 0,
      hasSourceAssignment: true,
    });

    const result = await diary.copyDay(
      userA,
      "2026-10-21",
      "2026-10-24",
      { allowExisting: false, copyDayType: true },
    );
    expect(result.copied).toBe(1);
    const target = await diary.getDayTotals(userA, "2026-10-24");
    expect(target.entries).toHaveLength(1);
    expect(target.entries[0]?.amount).toBe(200);
    expect(target.entries[0]?.meal).toBe("lunch");
    expect(target.entries[0]?.nutrients.kcal).toBe(380);
    expect(target.dayType?.name).toBe("Workout Day");

    await expect(
      diary.copyDay(userA, "2026-10-21", "2026-10-24", {
        allowExisting: false,
        copyDayType: false,
      }),
    ).rejects.toBeInstanceOf(diary.ExistingEntriesError);

    await diary.copyDay(userA, "2026-10-21", "2026-10-25", {
      allowExisting: false,
      copyDayType: false,
    });
    const noType = await dayTypes.getEffectiveDayType(userA, "2026-10-25");
    expect(noType.dayType?.name).toBe("Rest Day");
    expect(noType.assignedDayTypeId).toBeNull();
  });

  it("repeats a meal into a chosen meal and date", async () => {
    const preview = await diary.previewRepeatMeal(
      userA,
      "2026-10-21",
      "lunch",
      "2026-10-22",
      "dinner",
    );
    expect(preview.sourceCount).toBe(1);
    expect(preview.targetCount).toBe(0);
    const result = await diary.repeatMeal(
      userA,
      "2026-10-21",
      "lunch",
      "2026-10-22",
      "dinner",
      { allowExisting: false },
    );
    expect(result.copied).toBe(1);
    const target = await diary.getDayTotals(userA, "2026-10-22");
    expect(target.entries[0]?.meal).toBe("dinner");
    expect(target.entries[0]?.amount).toBe(200);
    await expect(
      diary.repeatMeal(
        userA,
        "2026-10-21",
        "lunch",
        "2026-10-22",
        "dinner",
        { allowExisting: false },
      ),
    ).rejects.toBeInstanceOf(diary.ExistingEntriesError);
  });

  it("saves and reuses a meal with its recorded quantities", async () => {
    const oats = (await foods.listCustomFoods(userA))[0];
    if (!oats?.id) throw new Error("Missing custom food.");
    const chicken = await foods.createCustomFood(
      userA,
      foodDraft("Chicken breast", {
        kcal: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
        fiber: 0,
      }),
    );

    const savedId = await savedMeals.createSavedMeal(userA, "Meal prep", [
      { foodId: oats.id, amount: 150, amountUnit: "g" },
      { foodId: chicken.id as string, amount: 120, amountUnit: "g" },
    ]);
    const saved = await savedMeals.getSavedMeal(userA, savedId);
    expect(saved?.items).toHaveLength(2);
    expect(saved?.items[0]?.amount).toBe(150);

    const added = await savedMeals.addSavedMealToDiary(
      userA,
      savedId,
      "2026-10-26",
      "lunch",
    );
    expect(added.entries).toHaveLength(2);
    const day = await diary.getDayTotals(userA, "2026-10-26");
    expect(day.totals.nutrients.kcal.value).toBe(768);
    expect(day.entries.map((entry) => entry.amount).sort()).toEqual([120, 150]);

    expect(
      await savedMeals.updateSavedMeal(userA, savedId, "Meal prep v2", [
        { foodId: oats.id, amount: 200, amountUnit: "g" },
      ]),
    ).toBe(true);
    const updated = await savedMeals.getSavedMeal(userA, savedId);
    expect(updated?.name).toBe("Meal prep v2");
    expect(updated?.items[0]?.amount).toBe(200);

    await expect(
      savedMeals.addSavedMealToDiary(userB, savedId, "2026-10-26", "lunch"),
    ).rejects.toThrow(/not found/i);
    await expect(
      savedMeals.createSavedMeal(userB, "Stolen", [
        { foodId: oats.id, amount: 100, amountUnit: "g" },
      ]),
    ).rejects.toThrow(/no longer exists/i);
  });

  it("lists favorites and recent foods from real activity", async () => {
    const oats = (await foods.listCustomFoods(userA)).find(
      (food) => food.name === "Rolled oats",
    );
    if (!oats?.id) throw new Error("Missing oats.");
    expect(await foods.setFoodFavorite(userA, oats.id, true)).toBe(true);
    expect((await foods.listFavoriteFoods(userA)).map((food) => food.id)).toContain(
      oats.id,
    );
    expect(await foods.setFoodFavorite(userB, oats.id, true)).toBe(false);
    const recent = await foods.listRecentFoods(userA, 10);
    expect(recent.map((food) => food.name)).toContain("Rolled oats");
    expect(recent.map((food) => food.name)).toContain("Chicken breast");
  });

  it("derives energy once at save time and records the source", async () => {
    const derived = await foods.createCustomFood(
      userA,
      foodDraft("Derived energy", {
        kcal: null,
        protein: 10,
        carbs: 20,
        fat: 5,
        fiber: null,
      }),
    );
    expect(derived.nutrients.kcal).toBe(165);
    expect(derived.energySource).toBe("calculated");
  });

  it("enforces ownership on diary entries and custom foods", async () => {
    const dayA = await diary.getDayTotals(userA, "2026-10-21");
    const entryId = dayA.entries[0]?.id as string;
    expect(await diary.getEntry(userB, entryId)).toBeNull();
    expect(
      await diary.updateEntry(userB, entryId, {
        meal: "snacks",
        amount: 1,
        amountUnit: "g",
      }),
    ).toBeNull();
    expect(await diary.deleteEntry(userB, entryId)).toBe(false);
    expect((await diary.getDayTotals(userB, "2026-10-21")).entries).toHaveLength(0);

    const oats = (await foods.listCustomFoods(userA)).find(
      (food) => food.name === "Rolled oats",
    );
    expect(await foods.getOwnedFood(userB, oats?.id as string)).toBeNull();
    await expect(
      foods.updateCustomFood(userB, oats?.id as string, foodDraft("Stolen oats")),
    ).resolves.toBeNull();
    expect(await foods.deleteFood(userB, oats?.id as string)).toBe(false);
  });

  it("prevents deleting assigned or default day types", async () => {
    const workoutDelete = await dayTypes.deleteDayType(userA, workoutId);
    expect(workoutDelete.ok).toBe(false);
    if (!workoutDelete.ok) {
      expect(workoutDelete.reason).toBe("assigned");
      expect(workoutDelete.assignedDates).toBeGreaterThan(0);
    }

    const unused = await dayTypes.createDayType(userA, {
      name: "Unused",
      kcal: 2000,
      protein: 150,
      carbs: 200,
      fat: 66.67,
      adjustmentMode: "all",
      proteinPct: 30,
      carbsPct: 40,
      fatPct: 30,
    });
    if (!unused.ok || !unused.dayType) throw new Error("Could not create day type.");
    expect(await dayTypes.deleteDayType(userA, unused.dayType.id)).toEqual({
      ok: true,
    });
  });

  it("keeps diary history when a custom food is deleted", async () => {
    const chicken = (await foods.listCustomFoods(userA)).find(
      (food) => food.name === "Chicken breast",
    );
    if (!chicken?.id) throw new Error("Missing chicken.");
    expect(await foods.deleteFood(userA, chicken.id)).toBe(true);
    const day = await diary.getDayTotals(userA, "2026-10-26");
    expect(day.entries).toHaveLength(2);
    const preserved = day.entries.find((entry) => entry.name === "Chicken breast");
    expect(preserved?.foodId).toBeNull();
    expect(day.totals.nutrients.kcal.value).toBe(768);
  });

  it("builds weekly totals from stored entries only", async () => {
    const dates = [
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ];
    const week = await diary.getWeekTotals(userA, dates);
    expect(week.map((day) => day.date)).toEqual(dates);
    expect(week.find((day) => day.date === "2026-10-19")?.entryCount).toBe(0);
    expect(week.find((day) => day.date === "2026-10-19")?.totals.nutrients.kcal.value).toBeNull();
    expect(week.find((day) => day.date === "2026-10-21")?.totals.nutrients.kcal.value).toBe(760);
    expect(week.find((day) => day.date === "2026-10-21")?.dayType?.name).toBe("Workout Day");
    expect(week.find((day) => day.date === "2026-10-22")?.dayType?.name).toBe("Rest Day");
    expect(week.find((day) => day.date === "2026-10-23")?.entryCount).toBe(0);
    expect(week.find((day) => day.date === "2026-10-23")?.dayType?.name).toBe("Rest Day");
  });

  it("saves a recipe with its final weight and logs it as a snapshot", async () => {
    const chicken = await foods.createCustomFood(
      userA,
      foodDraft("Recipe chicken", {
        kcal: 120,
        protein: 23,
        carbs: 0,
        fat: 2,
      }),
    );
    const rice = await foods.createCustomFood(
      userA,
      foodDraft("Recipe rice", {
        kcal: 350,
        protein: 7,
        carbs: 78,
        fat: 1,
      }),
    );
    const chickenId = chicken.id;
    const riceId = rice.id;
    if (!chickenId || !riceId) throw new Error("Missing recipe foods.");

    const recipeId = await savedMeals.createSavedMeal(
      userA,
      "Recipe test",
      [
        { foodId: chickenId, amount: 200, amountUnit: "g" },
        { foodId: riceId, amount: 100, amountUnit: "g" },
      ],
      { finalWeightG: 450, servings: 3 },
    );
    const recipe = await savedMeals.getSavedMeal(userA, recipeId);
    expect(recipe?.finalWeightG).toBe(450);
    expect(recipe?.servings).toBe(3);
    expect(await savedMeals.getSavedMeal(userB, recipeId)).toBeNull();

    const entry = await savedMeals.logRecipeToDiary(
      userA,
      recipeId,
      "2026-11-02",
      "dinner",
      150,
    );
    expect(entry.basisType).toBe("100g");
    expect(entry.amount).toBe(150);
    expect(entry.foodId).toBeNull();
    // Batch 590 kcal at 450 g prepared, so 150 g carries a third of it.
    expect(entry.nutrients.kcal ?? 0).toBeCloseTo(131.1111, 3);
    expect(entryPortion(entry).nutrients.kcal ?? 0).toBeCloseTo(196.67, 1);

    await savedMeals.updateSavedMeal(
      userA,
      recipeId,
      "Recipe test v2",
      [{ foodId: chickenId, amount: 100, amountUnit: "g" }],
      { finalWeightG: 100, servings: 1 },
    );
    const afterEdit = await diary.getEntry(userA, entry.id);
    expect(afterEdit?.nutrients.kcal ?? 0).toBeCloseTo(131.1111, 3);

    const copyId = await savedMeals.duplicateSavedMeal(userA, recipeId);
    expect(copyId).not.toBeNull();
    expect(copyId).not.toBe(recipeId);
  });

  it("stores preparation, package data and dashboard preferences", async () => {
    const skyr = await foods.createCustomFood(userA, {
      ...foodDraft("Skyr natural"),
      preparation: "raw",
      packageQuantity: 450,
      packageUnit: "g",
      drainedWeight: null,
    });
    expect(skyr.preparation).toBe("raw");
    expect(skyr.packageQuantity).toBe(450);
    expect(skyr.packageUnit).toBe("g");

    const defaults = await foods.createCustomFood(userA, foodDraft("Plain food"));
    expect(defaults.preparation).toBe("unspecified");
    expect(defaults.packageQuantity).toBeNull();

    const profile = await import("@/lib/repositories/profile");
    expect(
      await profile.updateDashboardNutrients(userA, ["kcal", "fiber"]),
    ).toBe(true);
    const rows = await db.query<{ dashboard_nutrients: string[] }>(
      `SELECT dashboard_nutrients FROM profiles WHERE user_id = $1`,
      [userA],
    );
    expect(rows[0]?.dashboard_nutrients).toEqual(["kcal", "fiber"]);
  });
});
