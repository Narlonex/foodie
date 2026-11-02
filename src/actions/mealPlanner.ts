"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  addPantryItem,
  addPlanItem,
  addShoppingItem,
  clearCheckedShoppingItems,
  deletePantryItem,
  deletePlanItem,
  deleteShoppingItem,
  generateShoppingList,
  logPlannedMeal,
  toggleShoppingItem,
} from "@/lib/repositories/mealPlanner";
import {
  isoDateSchema,
  mealPlanItemSchema,
  pantryItemSchema,
  shoppingItemSchema,
} from "@/lib/validation";
import type { ActionResult } from "./types";

function revalidatePlanner() {
  revalidatePath("/plan");
}

const idSchema = z.string().uuid();

export async function addPlanItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const viewer = await requireViewer();
  const parsed = mealPlanItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "plan.amountInvalid" };
  try {
    const id = await addPlanItem(viewer.user.id, parsed.data);
    revalidatePlanner();
    return { ok: true, message: "plan.added", data: { id } };
  } catch (error) {
    const message =
      error instanceof Error && error.message === "plan.needPortion"
        ? "plan.needPortion"
        : "plan.addError";
    return { ok: false, error: message };
  }
}

export async function deletePlanItemAction(
  id: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "plan.removeError" };
  const deleted = await deletePlanItem(viewer.user.id, parsed.data);
  if (!deleted) return { ok: false, error: "plan.removeError" };
  revalidatePlanner();
  return { ok: true, message: "plan.removed" };
}

export async function logPlannedMealAction(input: {
  date: string;
  meal: string;
}): Promise<ActionResult<{ count: number }>> {
  const viewer = await requireViewer();
  const parsed = z
    .object({ date: isoDateSchema, meal: z.enum(["breakfast", "lunch", "dinner", "snacks"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "plan.logError" };
  try {
    const count = await logPlannedMeal(
      viewer.user.id,
      parsed.data.date,
      parsed.data.meal,
    );
    if (count === 0) return { ok: false, error: "plan.nothingToLog" };
    revalidatePlanner();
    revalidatePath("/");
    revalidatePath("/history");
    return { ok: true, message: "plan.loggedCount", data: { count } };
  } catch {
    return { ok: false, error: "plan.logError" };
  }
}

export async function generateShoppingListAction(input: {
  from: string;
  to: string;
}): Promise<ActionResult<{ count: number }>> {
  const viewer = await requireViewer();
  const parsed = z
    .object({ from: isoDateSchema, to: isoDateSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "plan.shopping.error" };
  try {
    const count = await generateShoppingList(
      viewer.user.id,
      parsed.data.from,
      parsed.data.to,
    );
    revalidatePlanner();
    return {
      ok: true,
      message: count > 0 ? "plan.shopping.generated" : "plan.shopping.generatedEmpty",
      data: { count },
    };
  } catch {
    return { ok: false, error: "plan.shopping.error" };
  }
}

export async function addShoppingItemAction(
  input: unknown,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = shoppingItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "plan.shopping.error" };
  try {
    await addShoppingItem(viewer.user.id, parsed.data);
    revalidatePlanner();
    return { ok: true, message: "plan.shopping.added" };
  } catch {
    return { ok: false, error: "plan.shopping.error" };
  }
}

export async function toggleShoppingItemAction(
  id: string,
  checked: boolean,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "plan.shopping.error" };
  const updated = await toggleShoppingItem(
    viewer.user.id,
    parsed.data,
    checked,
  );
  if (!updated) return { ok: false, error: "plan.shopping.error" };
  revalidatePlanner();
  return { ok: true };
}

export async function deleteShoppingItemAction(
  id: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "plan.shopping.error" };
  const deleted = await deleteShoppingItem(viewer.user.id, parsed.data);
  if (!deleted) return { ok: false, error: "plan.shopping.error" };
  revalidatePlanner();
  return { ok: true, message: "plan.shopping.removed" };
}

export async function clearCheckedShoppingAction(): Promise<
  ActionResult<{ count: number }>
> {
  const viewer = await requireViewer();
  const count = await clearCheckedShoppingItems(viewer.user.id);
  revalidatePlanner();
  return { ok: true, message: "plan.shopping.cleared", data: { count } };
}

export async function addPantryItemAction(input: unknown): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = pantryItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "plan.pantry.error" };
  try {
    await addPantryItem(viewer.user.id, parsed.data);
    revalidatePlanner();
    return { ok: true, message: "plan.pantry.added" };
  } catch {
    return { ok: false, error: "plan.pantry.error" };
  }
}

export async function deletePantryItemAction(
  id: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "plan.pantry.error" };
  const deleted = await deletePantryItem(viewer.user.id, parsed.data);
  if (!deleted) return { ok: false, error: "plan.pantry.error" };
  revalidatePlanner();
  return { ok: true, message: "plan.pantry.removed" };
}
