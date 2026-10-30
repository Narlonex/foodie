import type { Food } from "@/lib/types";

export interface FormState {
  status: "idle" | "success" | "error";
  /** Translation key, translated by the UI. */
  message?: string;
  fieldErrors?: Record<string, string>;
  /** The row that was just created, so the caller can offer it immediately. */
  createdFood?: Food;
}

export const initialFormState: FormState = { status: "idle" };

export type ActionResult<T = Record<string, never>> =
  | { ok: true; message?: string; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
    };

export function errorFromZod(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
