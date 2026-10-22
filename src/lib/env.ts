/** Environment access. Secrets are only read on the server. */

function optional(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

const timezoneCandidate = optional("APP_TIMEZONE") ?? "Europe/Bratislava";

function validTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "Europe/Bratislava";
  }
}

const usdaApiKey = optional("USDA_FDC_API_KEY");

// USDA documents the shared DEMO_KEY for exploration before registering a
// personal key. It is intentionally a fallback, not a replacement: its limits
// are low, so deployments should set USDA_FDC_API_KEY.
export const env = {
  databaseUrl: optional("DATABASE_URL"),
  appTimezone: validTimezone(timezoneCandidate),
  nodeEnv: process.env.NODE_ENV ?? "development",
  offUserAgent:
    optional("OFF_USER_AGENT") ??
    `Foodie/1.0 (${optional("OFF_CONTACT_EMAIL") ?? "self-hosted"})`,
  usdaApiKey: usdaApiKey ?? "DEMO_KEY",
  usdaUsesDemoKey: usdaApiKey === null,
  isProduction: process.env.NODE_ENV === "production",
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(env.databaseUrl);
}

export function requireDatabaseUrl(): string {
  if (!env.databaseUrl) {
    throw new ConfigurationError(
      "DATABASE_URL is not configured. Add a Neon PostgreSQL connection string to the environment before using the app.",
    );
  }
  return env.databaseUrl;
}

export function isUsdaConfigured(): boolean {
  return Boolean(env.usdaApiKey);
}

export function isUsdaUsingDemoKey(): boolean {
  return env.usdaUsesDemoKey;
}
