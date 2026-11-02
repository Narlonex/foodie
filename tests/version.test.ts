import { describe, expect, it } from "vitest";
import { isNewerVersion, parseVersion } from "@/lib/version";

describe("version comparison", () => {
  it("parses APK version names", () => {
    expect(parseVersion("1.2.0")).toEqual([1, 2, 0]);
    expect(parseVersion("2")).toEqual([2]);
    expect(parseVersion("1.2.0-beta")).toBeNull();
  });

  it("compares numeric segments rather than strings", () => {
    expect(isNewerVersion("1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false);
    expect(isNewerVersion("1.1.9", "1.2.0")).toBe(false);
    expect(isNewerVersion("1.1.1", "1.1")).toBe(true);
  });

  it("never treats malformed versions as an update", () => {
    expect(isNewerVersion("latest", "1.1.0")).toBe(false);
    expect(isNewerVersion("1.2.0", "")).toBe(false);
  });
});
