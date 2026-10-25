"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer, setPreferenceCookies } from "@/lib/auth";
import {
  completeOnboarding,
  updateBodyMetrics,
  updateGoals,
  updateLanguage,
  updateTheme,
  updateUnitSystem,
  updateUsdaPreference,
} from "@/lib/repositories/profile";
import { updateDayTypeTargets } from "@/lib/repositories/dayTypes";
import { suggestedMacroTargets } from "@/lib/macroTargets";
import { estimateMaintenanceCalories } from "@/lib/metrics";
import {
  activityLevelSchema,
  bodyMetricsSchema,
  goalModeSchema,
  languageSchema,
  manualTargetsSchema,
  sexSchema,
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

function optionalNumberField(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function saveBodyMetricsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const goal = goalModeSchema.safeParse(formData.get("goalMode") ?? "maintenance");
  const sexRaw = String(formData.get("sex") ?? "").trim();
  const activityRaw = String(formData.get("activityLevel") ?? "").trim();
  const sex = sexRaw === "" ? null : sexSchema.safeParse(sexRaw);
  const activity =
    activityRaw === "" ? null : activityLevelSchema.safeParse(activityRaw);
  if (!goal.success || sex?.success === false || activity?.success === false) {
    return failure("settings.saveError");
  }
  const parsed = bodyMetricsSchema.safeParse({
    heightCm: optionalNumberField(formData.get("heightCm")),
    weightKg: optionalNumberField(formData.get("weightKg")),
    age: optionalNumberField(formData.get("age")),
    sex: sex?.success ? sex.data : null,
    activityLevel: activity?.success ? activity.data : null,
    goalMode: goal.data,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "validation.errorSummary",
      fieldErrors: errorFromZod(parsed.error.issues),
    };
  }
  const saved = await updateBodyMetrics(viewer.user.id, parsed.data, true);
  if (!saved) return failure("settings.saveError");

  if (formData.get("applySuggestion") === "on" && viewer.profile.defaultDayTypeId) {
    const maintenance = estimateMaintenanceCalories(parsed.data);
    if (maintenance !== null) {
      await updateGoals(viewer.user.id, parsed.data.goalMode, maintenance);
      const suggestion = suggestedMacroTargets(maintenance, parsed.data.goalMode);
      await updateDayTypeTargets(
        viewer.user.id,
        viewer.profile.defaultDayTypeId,
        {
          kcal: suggestion.kcal,
          protein: suggestion.protein,
          carbs: suggestion.carbs,
          fat: suggestion.fat,
        },
      );
      revalidatePath("/settings/goals");
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings/metrics");
  if (formData.get("context") === "onboarding") redirect("/");
  return success("metrics.saved");
}

export async function skipOnboardingAction(): Promise<void> {
  const viewer = await requireViewer();
  const saved = await completeOnboarding(viewer.user.id);
  if (!saved) return;
  revalidatePath("/", "layout");
  redirect("/");
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
