"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/dates";
import { getWeekTotals } from "@/lib/repositories/diary";
import { getDayType, updateDayTypeTargets } from "@/lib/repositories/dayTypes";
import { updateProfileWeight } from "@/lib/repositories/profile";
import {
  deleteWeightEntry,
  listWeightEntries,
  upsertWeightEntry,
} from "@/lib/repositories/weight";
import { deriveMacroTargets } from "@/lib/macroTargets";
import { weightEntrySchema } from "@/lib/validation";
import { calculateAdaptiveCheckIn } from "@/lib/weightTrend";
import type { ActionResult } from "./types";

function revalidateWeight() {
  revalidatePath("/progress");
  revalidatePath("/");
  revalidatePath("/settings/metrics");
}

export async function saveWeightAction(
  input: unknown,
): Promise<ActionResult<{ date: string; weightKg: number }>> {
  const viewer = await requireViewer();
  const parsed = weightEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation.weight" };
  }
  if (parsed.data.date > todayIso()) {
    return { ok: false, error: "progress.futureDate" };
  }
  try {
    const entry = await upsertWeightEntry(
      viewer.user.id,
      parsed.data.date,
      parsed.data.weightKg,
    );
    if (entry.date === todayIso()) {
      await updateProfileWeight(viewer.user.id, entry.weightKg);
    }
    revalidateWeight();
    return {
      ok: true,
      message: "progress.weightSaved",
      data: { date: entry.date, weightKg: entry.weightKg },
    };
  } catch {
    return { ok: false, error: "progress.saveError" };
  }
}

export async function deleteWeightAction(
  entryId: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z.string().uuid().safeParse(entryId);
  if (!parsed.success) return { ok: false, error: "progress.saveError" };
  const deleted = await deleteWeightEntry(viewer.user.id, parsed.data);
  if (!deleted) return { ok: false, error: "progress.saveError" };
  revalidateWeight();
  return { ok: true, message: "progress.weightDeleted" };
}

/**
 * Applies the current transparent suggestion to the default day type. The
 * suggestion is recalculated on the server from the same data the page shows;
 * the client cannot submit an arbitrary calorie number.
 */
export async function applyAdaptiveTargetAction(): Promise<
  ActionResult<{ kcal: number }>
> {
  const viewer = await requireViewer();
  const dayTypeId = viewer.profile.defaultDayTypeId;
  if (!dayTypeId) return { ok: false, error: "progress.noDefaultDayType" };
  const dayType = await getDayType(viewer.user.id, dayTypeId);
  if (!dayType) return { ok: false, error: "progress.noDefaultDayType" };

  const today = todayIso();
  const dates = Array.from({ length: 21 }, (_, index) =>
    addDays(today, index - 20),
  );
  const [weights, totalsByDay] = await Promise.all([
    listWeightEntries(viewer.user.id, addDays(today, -90)),
    getWeekTotals(viewer.user.id, dates),
  ]);
  const checkIn = calculateAdaptiveCheckIn({
    weights,
    intake: totalsByDay.map((day) => ({
      date: day.date,
      kcal: day.totals.nutrients.kcal.value,
      entryCount: day.entryCount,
    })),
    goalMode: viewer.profile.goalMode,
    today,
  });
  if (checkIn.status !== "ok") {
    return { ok: false, error: "progress.insufficientData" };
  }

  const targets = deriveMacroTargets({
    kcal: checkIn.suggestedKcal,
    protein: dayType.protein,
    carbs: dayType.carbs,
    fat: dayType.fat,
    adjustmentMode: "all",
    split: dayType.split,
  });
  if (!targets.ok) {
    return { ok: false, error: "progress.applyError" };
  }

  const updated = await updateDayTypeTargets(viewer.user.id, dayType.id, {
    kcal: targets.targets.kcal,
    protein: targets.targets.protein,
    carbs: targets.targets.carbs,
    fat: targets.targets.fat,
  });
  if (!updated) return { ok: false, error: "progress.applyError" };

  revalidateWeight();
  revalidatePath("/settings/day-types");
  revalidatePath("/settings/goals");
  return {
    ok: true,
    message: "progress.applied",
    data: { kcal: targets.targets.kcal },
  };
}
