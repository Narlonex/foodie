import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { queryOne } from "./db";
import type {
  ActivityLevel,
  GoalMode,
  Language,
  Profile,
  Sex,
  Theme,
  UnitSystem,
  Viewer,
} from "./types";

export const SESSION_COOKIE = "foodie_session";
export const LOCALE_COOKIE = "foodie_locale";
export const THEME_COOKIE = "foodie_theme";
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await queryOne(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt],
  );
  await queryOne(
    `DELETE FROM sessions WHERE expires_at < now()`,
  ).catch(() => undefined);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await queryOne(`DELETE FROM sessions WHERE token_hash = $1`, [
      hashToken(token),
    ]).catch(() => undefined);
  }
  cookieStore.delete(SESSION_COOKIE);
}

interface SessionUserRow {
  id: string;
  email: string;
  password_hash: string;
}

export async function findUserForLogin(email: string): Promise<SessionUserRow | null> {
  return queryOne<SessionUserRow>(
    `SELECT id, email, password_hash FROM users WHERE email = $1`,
    [email],
  );
}

interface ViewerRow {
  user_id: string;
  email: string;
  language: Language;
  theme: Theme;
  unit_system: UnitSystem;
  goal_mode: GoalMode;
  maintenance_calories: string | null;
  default_day_type_id: string | null;
  usda_enabled: boolean;
  height_cm: string | null;
  weight_kg: string | null;
  age: number | null;
  sex: Sex | null;
  activity_level: ActivityLevel | null;
  onboarding_completed: boolean;
}

const getViewerCached = cache(async (): Promise<Viewer | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<ViewerRow>(
    `SELECT p.user_id, u.email, p.language, p.theme, p.unit_system, p.goal_mode,
            p.maintenance_calories, p.default_day_type_id, p.usda_enabled,
            p.height_cm, p.weight_kg, p.age, p.sex, p.activity_level,
            p.onboarding_completed
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN profiles p ON p.user_id = u.id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) return null;

  const profile: Profile = {
    userId: row.user_id,
    email: row.email,
    language: row.language,
    theme: row.theme,
    unitSystem: row.unit_system,
    goalMode: row.goal_mode,
    maintenanceCalories:
      row.maintenance_calories === null ? null : Number(row.maintenance_calories),
    defaultDayTypeId: row.default_day_type_id,
    usdaEnabled: row.usda_enabled,
    heightCm: row.height_cm === null ? null : Number(row.height_cm),
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    age: row.age === null ? null : Number(row.age),
    sex: row.sex,
    activityLevel: row.activity_level,
    onboardingCompleted: row.onboarding_completed,
  };
  return { user: { id: row.user_id, email: row.email }, profile };
});

export async function getViewer(): Promise<Viewer | null> {
  return getViewerCached();
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function setPreferenceCookies(
  language: Language,
  theme: Theme,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, language, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  cookieStore.set(THEME_COOKIE, theme, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function getRequestPreferences(): Promise<{
  language: Language;
  theme: Theme;
}> {
  const cookieStore = await cookies();
  const cookieLanguage = cookieStore.get(LOCALE_COOKIE)?.value;
  const cookieTheme = cookieStore.get(THEME_COOKIE)?.value;
  const language: Language =
    cookieLanguage === "sk" || cookieLanguage === "en" ? cookieLanguage : "en";
  const theme: Theme = cookieTheme === "light" ? "light" : "dark";
  return { language, theme };
}
