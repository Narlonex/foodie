import { describe, expect, it } from "vitest";
import { csvEscape, rowsToCsv } from "@/lib/export";

describe("data export CSV", () => {
  it("escapes commas, quotes and line breaks", () => {
    expect(csvEscape('Rice, "jasmine"')).toBe('"Rice, ""jasmine"""');
    expect(csvEscape("two\nlines")).toBe('"two\nlines"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(12.5)).toBe("12.5");
  });

  it("writes a header and one row per entry", () => {
    const csv = rowsToCsv(
      [
        { key: "date", label: "date" },
        { key: "name", label: "name" },
      ],
      [
        { date: "2026-11-02", name: "Oats, cooked" },
        { date: "2026-11-03", name: "Rice" },
      ],
    );
    expect(csv).toBe(
      'date,name\r\n2026-11-02,"Oats, cooked"\r\n2026-11-03,Rice\r\n',
    );
  });
});
