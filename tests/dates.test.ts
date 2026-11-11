import { describe, expect, it } from "vitest";
import {
  formatLongDate,
  formatShortDate,
  formatWeekRange,
  localeFor,
} from "@/lib/dates";

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

  it("keeps the weekday first in short dates so week strips can split on it", () => {
    expect(formatShortDate("2026-10-29", "sk")).toMatch(/^št 29\. \S+$/);
    expect(formatShortDate("2026-10-29", "cs")).toMatch(/^čt 29\. \S+$/);
    expect(formatShortDate("2026-10-29", "en")).toBe("Thu 29 Oct");
  });

  it("assembles week ranges from parts instead of CLDR punctuation", () => {
    expect(formatWeekRange("2026-10-26", "en")).toBe(
      "26 Oct 2026 – 1 Nov 2026",
    );
    expect(formatWeekRange("2026-10-26", "sk")).toMatch(
      /^26\. \S+ 2026 – 1\. \S+ 2026$/,
    );
  });
});
