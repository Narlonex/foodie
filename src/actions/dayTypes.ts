"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import {
  createDayType,
  deleteDayType,
  setDefaultDayType,
  setDayTypeForDate,
  updateDayType,
} from "@/lib/repositories/dayTypes";
import { dayTypeFormSchema, isoDateSchema } from "@/lib/validation";
import { errorFromZod, type FormState } from "./types";
import type { MacroErrorCode } from "@/lib/macroTargets";

function numeric(formData: FormData, key: string): number {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") return Number.NaN;
  return Number(value.replace(",", "."));
}

function macroErrorKey(code: MacroErrorCode): string {
  switch (code) {
    case "kcal":
      return "dayTypes.errorKcal";
    case "split":
      return "dayTypes.errorSplit";
    case "negative-carbs":
      return "dayTypes.errorNegativeCarbs";
    case "negative-fats":
      return "dayTypes.errorNegativeFats";
    case "negative-proteins":
      return "dayTypes.errorNegativeProteins";
    default:
      return "dayTypes.errorMacro";
  }
}

function parseForm(formData: FormData) {
  return dayTypeFormSchema.safeParse({
    name: formData.get("name"),
    kcal: numeric(formData, "kcal"),
    protein: numeric(formData, "protein"),
    carbs: numeric(formData, "carbs"),
    fat: numeric(formData, "fat"),
    adjustmentMode: formData.get("adjustmentMode"),
    proteinPct: numeric(formData, "proteinPct"),
    carbsPct: numeric(formData, "carbsPct"),
    fatPct: numeric(formData, "fatPct"),
  });
}

export async function createDayTypeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "validation.errorSummary",
      fieldErrors: errorFromZod(parsed.error.issues),
    };
  }
  try {
    const result = await createDayType(viewer.user.id, parsed.data);
    if (!result.ok) {
      return {
        status: "error",
        message: result.macroError
          ? macroErrorKey(result.macroError.code)
          : "dayTypes.saveFailed",
      };
    }
    if (!viewer.profile.defaultDayTypeId && result.dayType) {
      await setDefaultDayType(viewer.user.id, result.dayType.id);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateDayTypeError") {
      return {
        status: "error",
        message: "dayTypes.nameTaken",
        fieldErrors: { name: "dayTypes.nameTaken" },
      };
    }
    return { status: "error", message: "dayTypes.saveFailed" };
  }
  revalidatePath("/", "layout");
  redirect("/settings/day-types?saved=created");
}

export async function updateDayTypeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const dayTypeId = String(formData.get("dayTypeId") ?? "");
  if (!dayTypeId) return { status: "error", message: "dayTypes.notFound" };
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "validation.errorSummary",
      fieldErrors: errorFromZod(parsed.error.issues),
    };
  }
  try {
    const result = await updateDayType(
      viewer.user.id,
      dayTypeId,
      parsed.data,
    );
    if (!result.ok) {
      return {
        status: "error",
        message: result.macroError
          ? macroErrorKey(result.macroError.code)
          : "dayTypes.saveFailed",
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateDayTypeError") {
      return {
        status: "error",
        message: "dayTypes.nameTaken",
        fieldErrors: { name: "dayTypes.nameTaken" },
      };
    }
    return { status: "error", message: "dayTypes.saveFailed" };
  }
  revalidatePath("/", "layout");
  redirect("/settings/day-types?saved=updated");
}

export async function deleteDayTypeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const dayTypeId = String(formData.get("dayTypeId") ?? "");
  if (!dayTypeId) return { status: "error", message: "dayTypes.notFound" };
  const result = await deleteDayType(viewer.user.id, dayTypeId);
  if (!result.ok) {
    if (result.reason === "assigned") {
      return { status: "error", message: "dayTypes.deleteAssigned" };
    }
    if (result.reason === "default") {
      return { status: "error", message: "dayTypes.deleteDefault" };
    }
    return { status: "error", message: "dayTypes.notFound" };
  }
  revalidatePath("/", "layout");
  redirect("/settings/day-types?saved=deleted");
}

export async function setDefaultDayTypeAction(formData: FormData): Promise<void> {
  const viewer = await requireViewer();
  const dayTypeId = String(formData.get("dayTypeId") ?? "");
  if (dayTypeId) {
    await setDefaultDayType(viewer.user.id, dayTypeId);
  }
  revalidatePath("/", "layout");
  redirect("/settings/day-types?saved=default");
}

export async function setDayTypeForDateAction(
  date: string,
  dayTypeId: string | null,
): Promise<{ ok: boolean }> {
  const viewer = await requireViewer();
  const parsed = isoDateSchema.safeParse(date);
  if (!parsed.success) return { ok: false };
  const id =
    dayTypeId === null || dayTypeId === "" || dayTypeId === "default"
      ? null
      : dayTypeId;
  const ok = await setDayTypeForDate(viewer.user.id, parsed.data, id);
  if (ok) revalidatePath("/", "layout");
  return { ok };
}
