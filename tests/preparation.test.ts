import { describe, expect, it } from "vitest";
import { detectPreparation } from "@/lib/foods/preparation";

describe("preparation detection", () => {
  it("reads an explicit raw state", () => {
    expect(detectPreparation("Chicken breast, raw")).toBe("raw");
    expect(detectPreparation("RAW almonds")).toBe("raw");
    expect(detectPreparation("Ryža surová")).toBe("raw");
  });

  it("reads an explicit cooked state", () => {
    expect(detectPreparation("Chicken breast, cooked")).toBe("cooked");
    expect(detectPreparation("Rice, boiled")).toBe("cooked");
    expect(detectPreparation("Zemiaky pečené")).toBe("cooked");
    expect(detectPreparation("Pan-fried salmon")).toBe("cooked");
  });

  it("leaves a plain name unspecified instead of guessing", () => {
    expect(detectPreparation("Chicken breast")).toBe("unspecified");
    expect(detectPreparation("Greek yogurt")).toBe("unspecified");
    expect(detectPreparation("Mlieko 2 %")).toBe("unspecified");
    expect(detectPreparation("")).toBe("unspecified");
  });

  it("treats a name that claims both states as unspecified", () => {
    expect(detectPreparation("Chicken, raw, cooked weight")).toBe(
      "unspecified",
    );
  });

  it("does not match a term inside a longer word", () => {
    expect(detectPreparation("Drawstring liquorice")).toBe("unspecified");
  });
});
