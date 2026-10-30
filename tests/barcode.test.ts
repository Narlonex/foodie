import { describe, expect, it } from "vitest";
import { barcodeLookupCandidates, normalizeBarcode } from "@/lib/barcode";

describe("barcode helpers", () => {
  it("keeps a clean numeric barcode unchanged", () => {
    expect(normalizeBarcode("3017620422003")).toBe("3017620422003");
  });

  it("strips spaces and dashes from manual or scanned input", () => {
    expect(normalizeBarcode("301 762 042-2003")).toBe("3017620422003");
  });

  it("rejects codes that are too short, too long or non-numeric", () => {
    expect(normalizeBarcode("12345")).toBeNull();
    expect(normalizeBarcode("123456789012345678901")).toBeNull();
    expect(normalizeBarcode("not a barcode")).toBeNull();
  });

  it("tries the leading-zero form for a 12-digit UPC-A", () => {
    expect(barcodeLookupCandidates("012345678905")).toEqual([
      "012345678905",
      "0012345678905",
    ]);
  });

  it("tries the trimmed form for a zero-prefixed EAN-13", () => {
    expect(barcodeLookupCandidates("0012345678905")).toEqual([
      "0012345678905",
      "012345678905",
    ]);
  });

  it("does not duplicate candidates for ordinary EAN-13 or EAN-8 codes", () => {
    expect(barcodeLookupCandidates("3017620422003")).toEqual([
      "3017620422003",
    ]);
    expect(barcodeLookupCandidates("96385074")).toEqual(["96385074"]);
  });
});
