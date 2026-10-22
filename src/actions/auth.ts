"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  createSession,
  destroySession,
  findUserForLogin,
  setPreferenceCookies,
} from "@/lib/auth";
import { withTransaction, queryOne } from "@/lib/db";
import { deriveMacroTargets } from "@/lib/macroTargets";
import { defaultDayTypeInput } from "@/lib/repositories/dayTypes";
import { loginSchema, registerSchema } from "@/lib/validation";
import { errorFromZod, type FormState } from "./types";
import type { Language, Theme } from "@/lib/types";

const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW = 15 * 60 * 1000;

function clientKey(ip: string, email: string): string {
  return `${ip}:${email}`;
}

function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= ATTEMPT_LIMIT;
}

function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < Date.now()) {
    attempts.set(key, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW });
    return;
  }
  entry.count += 1;
}

async function requestIp(): Promise<string> {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown"
  );
}

function languageFrom(value: FormDataEntryValue | null): Language {
  return value === "sk" ? "sk" : "en";
}

export async function registerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    language: languageFrom(formData.get("language")),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "validation.errorSummary",
      fieldErrors: errorFromZod(parsed.error.issues),
    };
  }
  const { email, password, language } = parsed.data;
  const passwordHash = await hashPassword(password);
  const defaultInput = defaultDayTypeInput(language);
  const computed = deriveMacroTargets({
    kcal: defaultInput.kcal,
    protein: defaultInput.protein,
    carbs: defaultInput.carbs,
    fat: defaultInput.fat,
    adjustmentMode: defaultInput.adjustmentMode,
    split: {
      protein: defaultInput.proteinPct,
      carbs: defaultInput.carbsPct,
      fat: defaultInput.fatPct,
    },
  });
  if (!computed.ok) {
    return { status: "error", message: "auth.genericError" };
  }

  let userId: string;
  const theme: Theme = "dark";
  try {
    userId = await withTransaction(async (client) => {
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
        [email, passwordHash],
      );
      const id = user.rows[0]?.id;
      if (!id) throw new Error("Could not create the user.");
      await client.query(
        `INSERT INTO profiles (user_id, language, theme) VALUES ($1, $2, $3)`,
        [id, language, theme],
      );
      const dayType = await client.query<{ id: string }>(
        `INSERT INTO day_types (
          user_id, name, kcal, protein_g, carbs_g, fat_g, adjustment_mode,
          protein_pct, carbs_pct, fat_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          id,
          defaultInput.name,
          computed.targets.kcal,
          computed.targets.protein,
          computed.targets.carbs,
          computed.targets.fat,
          computed.targets.adjustmentMode,
          computed.targets.split.protein,
          computed.targets.split.carbs,
          computed.targets.split.fat,
        ],
      );
      const dayTypeId = dayType.rows[0]?.id;
      if (!dayTypeId) throw new Error("Could not create the default day type.");
      await client.query(
        `UPDATE profiles SET default_day_type_id = $2 WHERE user_id = $1`,
        [id, dayTypeId],
      );
      return id;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return {
        status: "error",
        message: "auth.emailTaken",
        fieldErrors: { email: "auth.emailTaken" },
      };
    }
    return { status: "error", message: "auth.genericError" };
  }

  await setPreferenceCookies(language, theme);
  await createSession(userId);
  redirect("/");
}

export async function loginAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "auth.required",
      fieldErrors: errorFromZod(parsed.error.issues),
    };
  }
  const { email, password } = parsed.data;
  const ip = await requestIp();
  const key = clientKey(ip, email);
  if (isRateLimited(key)) {
    return { status: "error", message: "auth.invalidCredentials" };
  }

  const user = await findUserForLogin(email);
  if (!user) {
    // Keep the response cost close to a real verification attempt.
    await hashPassword(password);
    recordFailure(key);
    return { status: "error", message: "auth.invalidCredentials" };
  }
  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    recordFailure(key);
    return { status: "error", message: "auth.invalidCredentials" };
  }
  attempts.delete(key);

  const profile = await queryOne<{ language: Language; theme: Theme }>(
    `SELECT language, theme FROM profiles WHERE user_id = $1`,
    [user.id],
  );
  await setPreferenceCookies(profile?.language ?? "en", profile?.theme ?? "dark");
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
