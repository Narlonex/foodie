"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  addSavedMealToDiary,
  createSavedMeal,
  deleteSavedMeal,
  duplicateSavedMeal,
  logRecipeToDiary,
  updateSavedMeal,
} from "@/lib/repositories/savedMeals";
import {
  amountUnitSchema,
  isoDateSchema,
  mealSchema,
  positiveAmountSchema,
  savedMealNameSchema,
} from "@/lib/validation";
import type { ActionResult, FormState } from "./types";

const itemSchema = z.object({
  foodId: z.string().uuid(),
  amount: positiveAmountSchema,
  amountUnit: amountUnitSchema,
});

const optionalMeasure = z
  .number()
  .finite("validation.package")
  .positive("validation.package")
  .max(100_000, "validation.package")
  .nullable()
  .optional()
  .default(null);

const mealInputSchema = z.object({
  savedMealId: z.string().uuid().optional(),
  name: savedMealNameSchema,
  items: z.array(itemSchema).min(1, "savedMeals.needItem"),
  finalWeightG: optionalMeasure,
  servings: z
    .number()
    .finite("validation.package")
    .positive("validation.package")
    .max(1000, "validation.package")
    .nullable()
    .optional()
    .default(null),
});

function errorForItems(): FormState {
  return { status: "error", message: "savedMeals.saveError" };
}

export async function saveMealAction(
  input: unknown,
): Promise<ActionResult<{ savedMealId: string }>> {
  const viewer = await requireViewer();
  const parsed = mealInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "savedMeals.saveError" };
  }
  try {
    if (parsed.data.savedMealId) {
      const updated = await updateSavedMeal(
        viewer.user.id,
        parsed.data.savedMealId,
        parsed.data.name,
        parsed.data.items,
        {
          finalWeightG: parsed.data.finalWeightG,
          servings: parsed.data.servings,
        },
      );
      if (!updated) return { ok: false, error: "savedMeals.saveError" };
      revalidatePath("/foods");
      return {
        ok: true,
        message: "savedMeals.updated",
        data: { savedMealId: parsed.data.savedMealId },
      };
    }
    const id = await createSavedMeal(
      viewer.user.id,
      parsed.data.name,
      parsed.data.items,
      {
        finalWeightG: parsed.data.finalWeightG,
        servings: parsed.data.servings,
      },
    );
    revalidatePath("/foods");
    return { ok: true, message: "savedMeals.created", data: { savedMealId: id } };
  } catch {
    return { ok: false, error: "savedMeals.saveError" };
  }
}

const addSchema = z.object({
  savedMealId: z.string().uuid(),
  date: isoDateSchema,
  meal: mealSchema,
});

export async function addSavedMealAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const viewer = await requireViewer();
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "savedMeals.saveError" };
  try {
    const result = await addSavedMealToDiary(
      viewer.user.id,
      parsed.data.savedMealId,
      parsed.data.date,
      parsed.data.meal,
    );
    revalidatePath("/");
    revalidatePath("/history");
    revalidatePath("/foods");
    return {
      ok: true,
      message: "savedMeals.added",
      data: { count: result.entries.length },
    };
  } catch {
    return { ok: false, error: "savedMeals.invalidFood" };
  }
}

export async function deleteSavedMealAction(
  savedMealId: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z.string().uuid().safeParse(savedMealId);
  if (!parsed.success) return { ok: false, error: "savedMeals.saveError" };
  const deleted = await deleteSavedMeal(viewer.user.id, savedMealId);
  if (!deleted) return { ok: false, error: "savedMeals.saveError" };
  revalidatePath("/foods");
  return { ok: true, message: "savedMeals.deleted" };
}

export async function duplicateSavedMealAction(
  savedMealId: string,
): Promise<ActionResult<{ savedMealId: string }>> {
  const viewer = await requireViewer();
  const parsed = z.string().uuid().safeParse(savedMealId);
  if (!parsed.success) return { ok: false, error: "savedMeals.saveError" };
  try {
    const id = await duplicateSavedMeal(viewer.user.id, parsed.data);
    if (!id) return { ok: false, error: "savedMeals.saveError" };
    revalidatePath("/foods");
    return {
      ok: true,
      message: "savedMeals.duplicated",
      data: { savedMealId: id },
    };
  } catch {
    return { ok: false, error: "savedMeals.saveError" };
  }
}

const logRecipeSchema = z.object({
  savedMealId: z.string().uuid(),
  date: isoDateSchema,
  meal: mealSchema,
  grams: positiveAmountSchema,
});

/** Logs a recipe as one entry, scaled from its per-100-g values. */
export async function logRecipeAction(
  input: unknown,
): Promise<ActionResult<{ entryId: string }>> {
  const viewer = await requireViewer();
  const parsed = logRecipeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "recipes.amountInvalid" };
  try {
    const entry = await logRecipeToDiary(
      viewer.user.id,
      parsed.data.savedMealId,
      parsed.data.date,
      parsed.data.meal,
      parsed.data.grams,
    );
    revalidatePath("/");
    revalidatePath("/history");
    revalidatePath("/foods");
    return { ok: true, message: "recipes.logged", data: { entryId: entry.id } };
  } catch {
    return { ok: false, error: "recipes.logFailed" };
  }
}

// Kept for forms that call the builder with malformed data.
export async function validateSavedMealInput(
  input: unknown,
): Promise<FormState> {
  const parsed = mealInputSchema.safeParse(input);
  return parsed.success ? { status: "idle" } : errorForItems();
}
