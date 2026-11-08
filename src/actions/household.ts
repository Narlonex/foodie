"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  createHousehold,
  joinHousehold,
  leaveHousehold,
} from "@/lib/repositories/households";
import type { ActionResult } from "./types";

function revalidateHousehold() {
  revalidatePath("/settings/household");
  revalidatePath("/plan");
  revalidatePath("/");
}

export async function createHouseholdAction(
  input: unknown,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(80) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "household.nameRequired" };
  try {
    await createHousehold(viewer.user.id, parsed.data.name);
    revalidateHousehold();
    return { ok: true, message: "household.created" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "household.createFailed",
    };
  }
}

export async function joinHouseholdAction(
  input: unknown,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z
    .object({ code: z.string().trim().min(6).max(16) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "household.invalidCode" };
  try {
    await joinHousehold(viewer.user.id, parsed.data.code);
    revalidateHousehold();
    return { ok: true, message: "household.joined" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "household.joinFailed",
    };
  }
}

export async function leaveHouseholdAction(): Promise<ActionResult> {
  const viewer = await requireViewer();
  try {
    await leaveHousehold(viewer.user.id);
    revalidateHousehold();
    return { ok: true, message: "household.left" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "household.leaveFailed",
    };
  }
}
