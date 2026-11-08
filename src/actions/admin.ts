"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { reviewFoodSubmission } from "@/lib/repositories/catalogAdmin";
import type { ActionResult } from "./types";

const reviewSchema = z.object({
  submissionId: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(1000).optional(),
});

async function requireAdmin() {
  const viewer = await requireViewer();
  if (viewer.profile.isAdmin !== true) {
    throw new Error("admin.forbidden");
  }
  return viewer;
}

export async function reviewSubmissionAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "admin.invalid" };
  try {
    const viewer = await requireAdmin();
    const result = await reviewFoodSubmission(
      parsed.data.submissionId,
      viewer.user.id,
      parsed.data.approve,
      parsed.data.note ?? null,
    );
    if (!result) return { ok: false, error: "admin.notPending" };
    revalidatePath("/admin");
    revalidatePath("/foods");
    return {
      ok: true,
      message: parsed.data.approve ? "admin.approved" : "admin.rejected",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "admin.failed",
    };
  }
}
