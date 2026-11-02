import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  const pwa = manifest();

  it("is installable and scoped to the app", () => {
    expect(pwa.start_url).toBe("/");
    expect(pwa.scope).toBe("/");
    expect(pwa.display).toBe("standalone");
    expect(pwa.name).toContain("Foodie");
    expect(pwa.short_name).toBe("Foodie");
  });

  it("ships every declared icon", () => {
    expect(pwa.icons?.length).toBeGreaterThanOrEqual(4);
    for (const icon of pwa.icons ?? []) {
      if (typeof icon === "string") continue;
      expect(icon.src).toBeTruthy();
      const file = path.join(
        process.cwd(),
        "public",
        icon.src.replace(/^\//, ""),
      );
      expect(existsSync(file), `${icon.src} should exist`).toBe(true);
    }
    expect(
      pwa.icons?.some(
        (icon) =>
          typeof icon !== "string" && String(icon.purpose).includes("maskable"),
      ),
    ).toBe(true);
  });

  it("ships the offline fallback and service worker", () => {
    expect(existsSync(path.join(process.cwd(), "public", "offline.html"))).toBe(
      true,
    );
    expect(existsSync(path.join(process.cwd(), "public", "sw.js"))).toBe(true);
  });
});
