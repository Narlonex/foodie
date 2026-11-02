"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import {
  deleteBodyMeasurement,
  saveBodyMeasurement,
  type MeasurementInput,
} from "@/lib/repositories/measurements";
import { saveHabitDay } from "@/lib/repositories/habits";
import {
  bodyMeasurementSchema,
  habitDaySchema,
} from "@/lib/validation";
import type { ActionResult } from "./types";

function revalidateInsights() {
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/progress");
}

export async function saveHabitsAction(
  input: unknown,
): Promise<ActionResult<{ date: string }>> {
  const viewer = await requireViewer();
  const parsed = habitDaySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation.habit" };
  }
  if (parsed.data.date > todayIso()) {
    return { ok: false, error: "insights.futureDate" };
  }
  try {
    await saveHabitDay(viewer.user.id, parsed.data);
    revalidateInsights();
    return { ok: true, message: "habits.saved", data: { date: parsed.data.date } };
  } catch {
    return { ok: false, error: "insights.saveError" };
  }
}

export async function saveMeasurementAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const viewer = await requireViewer();
  const parsed = bodyMeasurementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation.measurement" };
  }
  if (parsed.data.date > todayIso()) {
    return { ok: false, error: "insights.futureDate" };
  }
  try {
    const measurement = await saveBodyMeasurement(
      viewer.user.id,
      parsed.data as MeasurementInput,
    );
    revalidateInsights();
    return {
      ok: true,
      message: "measurements.saved",
      data: { id: measurement.id },
    };
  } catch {
    return { ok: false, error: "insights.saveError" };
  }
}

export async function deleteMeasurementAction(
  id: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "measurements.notFound" };
  try {
    const deleted = await deleteBodyMeasurement(viewer.user.id, parsed.data);
    if (!deleted) return { ok: false, error: "measurements.notFound" };
    revalidateInsights();
    return { ok: true, message: "measurements.deleted" };
  } catch {
    return { ok: false, error: "insights.saveError" };
  }
}
