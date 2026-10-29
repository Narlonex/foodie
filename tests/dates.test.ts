import { describe, expect, it } from "vitest";
import { formatLongDate, localeFor } from "@/lib/dates";

describe("localized dates", () => {
  it("uses the expected locale for every supported language", () => {
    expect(localeFor("en")).toBe("en-GB");
    expect(localeFor("sk")).toBe("sk-SK");
    expect(localeFor("cs")).toBe("cs-CZ");
  });

  it("formats a long date naturally in Czech", () => {
    expect(formatLongDate("2026-10-29", "cs")).toBe(
      "čtvrtek 29. října 2026",
    );
  });

  it("formats a long date naturally in Slovak and English", () => {
    expect(formatLongDate("2026-10-29", "sk")).toBe(
      "štvrtok 29. októbra 2026",
    );
    expect(formatLongDate("2026-10-29", "en")).toBe(
      "Thursday, 29 October 2026",
    );
  });
});
