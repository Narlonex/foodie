"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  acceptCoachInvite,
  createCoachInvite,
  leaveCoach,
  revokeCoachClient,
} from "@/lib/repositories/coach";
import type { ActionResult } from "./types";

function revalidateCoach() {
  revalidatePath("/coach");
}

export async function createCoachInviteAction(): Promise<
  ActionResult<{ code: string }>
> {
  const viewer = await requireViewer();
  try {
    const invite = await createCoachInvite(viewer.user.id);
    revalidateCoach();
    return {
      ok: true,
      message: "coach.inviteCreated",
      data: { code: invite.code },
    };
  } catch {
    return { ok: false, error: "coach.createFailed" };
  }
}

export async function acceptCoachInviteAction(
  input: unknown,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z
    .object({ code: z.string().trim().min(6).max(16) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "coach.invalidCode" };
  try {
    await acceptCoachInvite(viewer.user.id, parsed.data.code);
    revalidateCoach();
    return { ok: true, message: "coach.joined" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "coach.invalidCode",
    };
  }
}

export async function revokeCoachClientAction(
  clientId: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z.string().uuid().safeParse(clientId);
  if (!parsed.success) return { ok: false, error: "coach.revokeFailed" };
  await revokeCoachClient(viewer.user.id, parsed.data);
  revalidateCoach();
  return { ok: true, message: "coach.revoked" };
}

export async function leaveCoachAction(
  coachId: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z.string().uuid().safeParse(coachId);
  if (!parsed.success) return { ok: false, error: "coach.leaveFailed" };
  await leaveCoach(viewer.user.id, parsed.data);
  revalidateCoach();
  return { ok: true, message: "coach.left" };
}
