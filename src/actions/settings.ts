"use server";

import { revalidatePath } from "next/cache";
import { requireViewer, setPreferenceCookies } from "@/lib/auth";
import {
  updateGoals,
  updateLanguage,
  updateTheme,
  updateUnitSystem,
  updateUsdaPreference,
} from "@/lib/repositories/profile";
import { updateDayTypeTargets } from "@/lib/repositories/dayTypes";
import {
  goalModeSchema,
  languageSchema,
  manualTargetsSchema,
  themeSchema,
  unitSystemSchema,
} from "@/lib/validation";
import { errorFromZod, type FormState } from "./types";

function success(message: string): FormState {
  return { status: "success", message };
}

function failure(message: string): FormState {
  return { status: "error", message };
}

export async function setThemeAction(theme: string): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) return failure("settings.saveError");
  await updateTheme(viewer.user.id, parsed.data);
  await setPreferenceCookies(viewer.profile.language, parsed.data);
  revalidatePath("/", "layout");
  return success("theme.saved");
}

export async function updateAppearanceAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = themeSchema.safeParse(formData.get("theme"));
  if (!parsed.success) {
    return failure("settings.saveError");
  }
  await updateTheme(viewer.user.id, parsed.data);
  await setPreferenceCookies(viewer.profile.language, parsed.data);
  revalidatePath("/", "layout");
  return success("appearance.saved");
}

export async function updateLanguageAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = languageSchema.safeParse(formData.get("language"));
  if (!parsed.success) {
    return failure("settings.saveError");
  }
  await updateLanguage(viewer.user.id, parsed.data);
  await setPreferenceCookies(parsed.data, viewer.profile.theme);
  revalidatePath("/", "layout");
  return success("language.saved");
}

export async function updateUnitsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = unitSystemSchema.safeParse(formData.get("unitSystem"));
  if (!parsed.success) {
    return failure("settings.saveError");
  }
  await updateUnitSystem(viewer.user.id, parsed.data);
  revalidatePath("/", "layout");
  return success("units.saved");
}

export async function updateUsdaEnabledAction(
  enabled: boolean,
): Promise<FormState> {
  const viewer = await requireViewer();
  const changed = await updateUsdaPreference(viewer.user.id, enabled === true);
  if (!changed) return failure("settings.saveError");
  revalidatePath("/", "layout");
  return success(enabled ? "foodData.usdaOn" : "foodData.usdaOff");
}

export async function updateGoalsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const mode = goalModeSchema.safeParse(formData.get("goalMode"));
  if (!mode.success) return failure("settings.saveError");
  const rawMaintenance = String(formData.get("maintenanceCalories") ?? "").trim();
  let maintenance: number | null = null;
  if (rawMaintenance !== "") {
    const parsed = Number(rawMaintenance.replace(",", "."));
    if (
      !Number.isFinite(parsed) ||
      parsed < 500 ||
      parsed > 20_000
    ) {
      return {
        status: "error",
        message: "goals.errorMaintenance",
        fieldErrors: { maintenanceCalories: "goals.errorMaintenance" },
      };
    }
    maintenance = parsed;
  }
  await updateGoals(viewer.user.id, mode.data, maintenance);
  revalidatePath("/settings/goals");
  return success("goals.saved");
}

function numberField(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").trim();
  return raw === "" ? Number.NaN : Number(raw.replace(",", "."));
}

/** Saves all four targets for the user's default day type exactly as entered. */
export async function updateDefaultTargetsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = manualTargetsSchema.safeParse({
    kcal: numberField(formData.get("kcal")),
    protein: numberField(formData.get("protein")),
    carbs: numberField(formData.get("carbs")),
    fat: numberField(formData.get("fat")),
  });
  if (!parsed.success) {
    const fieldErrors = errorFromZod(parsed.error.issues);
    return {
      status: "error",
      message: "goals.errorTargets",
      fieldErrors,
    };
  }
  if (!viewer.profile.defaultDayTypeId) {
    return failure("goals.noDefaultType");
  }
  const updated = await updateDayTypeTargets(
    viewer.user.id,
    viewer.profile.defaultDayTypeId,
    parsed.data,
  );
  if (!updated) return failure("goals.noDefaultType");
  revalidatePath("/", "layout");
  revalidatePath("/settings/goals");
  return success("goals.targetsSaved");
}
