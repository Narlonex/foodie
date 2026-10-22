"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  copyDay,
  deleteEntry,
  getEntry,
  previewCopyDay,
  previewRepeatMeal,
  repeatMeal,
  updateEntry,
  type CopyPreview,
} from "@/lib/repositories/diary";
import {
  amountUnitSchema,
  displayAmountUnitSchema,
  isoDateSchema,
  mealSchema,
  positiveAmountSchema,
} from "@/lib/validation";
import { toBaseAmount } from "@/lib/nutrition";
import type { ActionResult, FormState } from "./types";

function revalidateDiary() {
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/foods");
}

export async function updateEntryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const entryId = String(formData.get("entryId") ?? "");
  if (!entryId) return { status: "error", message: "entry.error" };
  const existing = await getEntry(viewer.user.id, entryId);
  if (!existing) return { status: "error", message: "entry.error" };
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const amount = Number(amountRaw);
  const displayUnit = displayAmountUnitSchema.safeParse(
    formData.get("displayUnit"),
  );
  if (!Number.isFinite(amount) || amount <= 0 || !displayUnit.success) {
    return {
      status: "error",
      message: "entry.amountInvalid",
      fieldErrors: { amount: "entry.amountInvalid" },
    };
  }
  const mealParsed = mealSchema.safeParse(formData.get("meal"));
  if (!mealParsed.success) {
    return { status: "error", message: "entry.error" };
  }
  const unitParsed = amountUnitSchema.safeParse(existing.amountUnit);
  if (!unitParsed.success) return { status: "error", message: "entry.error" };
  let base;
  try {
    base = toBaseAmount(amount, displayUnit.data);
  } catch {
    return {
      status: "error",
      message: "entry.amountInvalid",
      fieldErrors: { amount: "entry.amountInvalid" },
    };
  }
  if (base.amountUnit !== unitParsed.data || base.amount > 100_000) {
    return {
      status: "error",
      message: "entry.amountInvalid",
      fieldErrors: { amount: "entry.amountInvalid" },
    };
  }
  const updated = await updateEntry(viewer.user.id, entryId, {
    meal: mealParsed.data,
    amount: base.amount,
    amountUnit: base.amountUnit,
  });
  if (!updated) return { status: "error", message: "entry.error" };
  revalidateDiary();
  return { status: "success", message: "entry.saved" };
}

export async function deleteEntryAction(
  entryId: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z.string().uuid().safeParse(entryId);
  if (!parsed.success) return { ok: false, error: "entry.error" };
  const deleted = await deleteEntry(viewer.user.id, entryId);
  if (!deleted) return { ok: false, error: "entry.error" };
  revalidateDiary();
  return { ok: true, message: "entry.deleted" };
}

const copySchema = z.object({
  sourceDate: isoDateSchema,
  targetDate: isoDateSchema,
  allowExisting: z.boolean().default(false),
  copyDayType: z.boolean().default(false),
});

export async function previewCopyDayAction(
  input: unknown,
): Promise<ActionResult<CopyPreview>> {
  const viewer = await requireViewer();
  const parsed = copySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "copyDay.error" };
  if (parsed.data.sourceDate === parsed.data.targetDate) {
    return { ok: false, error: "copyDay.errorSameDate" };
  }
  const preview = await previewCopyDay(
    viewer.user.id,
    parsed.data.sourceDate,
    parsed.data.targetDate,
  );
  return { ok: true, data: preview };
}

export async function copyDayAction(
  input: unknown,
): Promise<ActionResult<{ copied: number }>> {
  const viewer = await requireViewer();
  const parsed = copySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "copyDay.error" };
  try {
    const result = await copyDay(
      viewer.user.id,
      parsed.data.sourceDate,
      parsed.data.targetDate,
      {
        allowExisting: parsed.data.allowExisting,
        copyDayType: parsed.data.copyDayType,
      },
    );
    revalidateDiary();
    return {
      ok: true,
      message: "copyDay.done",
      data: { copied: result.copied },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "ExistingEntriesError") {
      return { ok: false, error: "copyDay.destinationHas" };
    }
    return { ok: false, error: "copyDay.error" };
  }
}

const repeatSchema = z.object({
  sourceDate: isoDateSchema,
  sourceMeal: mealSchema,
  targetDate: isoDateSchema,
  targetMeal: mealSchema,
  allowExisting: z.boolean().default(false),
});

export async function previewRepeatMealAction(
  input: unknown,
): Promise<ActionResult<{ sourceCount: number; targetCount: number }>> {
  const viewer = await requireViewer();
  const parsed = repeatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "repeatMeal.error" };
  const preview = await previewRepeatMeal(
    viewer.user.id,
    parsed.data.sourceDate,
    parsed.data.sourceMeal,
    parsed.data.targetDate,
    parsed.data.targetMeal,
  );
  return { ok: true, data: preview };
}

export async function repeatMealAction(
  input: unknown,
): Promise<ActionResult<{ copied: number }>> {
  const viewer = await requireViewer();
  const parsed = repeatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "repeatMeal.error" };
  try {
    const result = await repeatMeal(
      viewer.user.id,
      parsed.data.sourceDate,
      parsed.data.sourceMeal,
      parsed.data.targetDate,
      parsed.data.targetMeal,
      { allowExisting: parsed.data.allowExisting },
    );
    revalidateDiary();
    return {
      ok: true,
      message: "repeatMeal.done",
      data: { copied: result.copied },
    };
  } catch {
    return { ok: false, error: "repeatMeal.error" };
  }
}

export async function validateEntryAmount(
  amount: unknown,
  amountUnit: unknown,
): Promise<{ amount: number; amountUnit: ReturnType<typeof amountUnitSchema.parse> } | null> {
  const parsedAmount = positiveAmountSchema.safeParse(amount);
  const parsedUnit = amountUnitSchema.safeParse(amountUnit);
  if (!parsedAmount.success || !parsedUnit.success) return null;
  return { amount: parsedAmount.data, amountUnit: parsedUnit.data };
}
