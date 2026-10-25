import { env } from "./env";

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function todayIso(): string {
  return dateInTimeZone(env.appTimezone, new Date());
}

export function dateInTimeZone(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function parseDateParam(
  value: string | string[] | undefined,
  fallback = todayIso(),
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && isValidIsoDate(candidate) ? candidate : fallback;
}

function toUtcDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

function fromUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

/** Monday-based week start. */
export function startOfWeek(iso: string): string {
  const date = toUtcDate(iso);
  const weekday = date.getUTCDay(); // 0 = Sunday
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  return fromUtcDate(date);
}

export function weekDates(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(startIso, index));
}

export function isToday(iso: string): boolean {
  return iso === todayIso();
}

export function localeFor(language: "en" | "sk"): string {
  return language === "sk" ? "sk-SK" : "en-GB";
}

export function formatLongDate(iso: string, language: "en" | "sk"): string {
  const parts = new Intl.DateTimeFormat(localeFor(language), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(toUtcDate(iso));
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  // Punctuation is assembled here because CLDR versions disagree about the
  // comma after the weekday; relying on `format()` renders a different string
  // on the server than in the browser and breaks hydration.
  return language === "sk"
    ? `${part("weekday")} ${part("day")}. ${part("month")} ${part("year")}`
    : `${part("weekday")}, ${part("day")} ${part("month")} ${part("year")}`;
}

export function formatShortDate(iso: string, language: "en" | "sk"): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(toUtcDate(iso));
}

export function formatWeekRange(startIso: string, language: "en" | "sk"): string {
  const endIso = addDays(startIso, 6);
  const formatter = new Intl.DateTimeFormat(localeFor(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(toUtcDate(startIso))} – ${formatter.format(toUtcDate(endIso))}`;
}

export function formatDateTime(
  isoDateTime: string,
  language: "en" | "sk",
): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDateTime));
}
