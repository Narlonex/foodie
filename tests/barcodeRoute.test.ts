import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/foods/openFoodFacts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/foods/openFoodFacts")>();
  return { ...actual, fetchOpenFoodFactsProduct: vi.fn() };
});
vi.mock("@/lib/foods/usda", () => ({
  isUsdaEnabled: vi.fn(),
  lookupUsdaBarcode: vi.fn(),
}));

import { GET } from "@/app/api/foods/barcode/route";
import { getViewer } from "@/lib/auth";
import {
  fetchOpenFoodFactsProduct,
  FoodApiError,
} from "@/lib/foods/openFoodFacts";
import { isUsdaEnabled, lookupUsdaBarcode } from "@/lib/foods/usda";
import { EMPTY_NUTRIENTS, type FoodCandidate } from "@/lib/types";

const viewer = {
  user: { id: "user-1", email: "person@example.com" },
  profile: { usdaEnabled: true },
};

function candidate(source: "off" | "usda", barcode: string): FoodCandidate {
  return {
    source,
    externalId: `${source}-1`,
    barcode,
    name: source === "off" ? "Skyr" : "Greek yogurt",
    brand: null,
    basisType: "100g",
    servingSize: null,
    servingUnit: null,
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 63 },
    energySource: "provided",
    imageUrl: null,
    preparation: "unspecified",
    packageQuantity: null,
    packageUnit: null,
    drainedWeight: null,
  };
}

function lookup(code = "8580000000001") {
  return GET(
    new NextRequest(`http://localhost/api/foods/barcode?code=${code}`),
  );
}

const offLookup = vi.mocked(fetchOpenFoodFactsProduct);
const usdaLookup = vi.mocked(lookupUsdaBarcode);
const usdaAvailable = vi.mocked(isUsdaEnabled);
const viewerMock = vi.mocked(getViewer);

beforeEach(() => {
  vi.resetAllMocks();
  viewerMock.mockResolvedValue(viewer as never);
  usdaAvailable.mockReturnValue(true);
  offLookup.mockResolvedValue(candidate("off", "8580000000001"));
  usdaLookup.mockResolvedValue(candidate("usda", "8580000000001"));
});

describe("barcode lookup", () => {
  it("uses Open Food Facts first", async () => {
    const response = await lookup();
    const payload = (await response.json()) as { food: FoodCandidate };

    expect(response.status).toBe(200);
    expect(payload.food.source).toBe("off");
    expect(usdaLookup).not.toHaveBeenCalled();
  });

  it("falls back to USDA branded foods when OFF misses", async () => {
    offLookup.mockRejectedValue(
      new FoodApiError("not-found", "Product not found."),
    );

    const response = await lookup();
    const payload = (await response.json()) as { food: FoodCandidate };

    expect(response.status).toBe(200);
    expect(payload.food.source).toBe("usda");
    expect(usdaLookup).toHaveBeenCalledWith("8580000000001");
  });

  it("returns 404 only when both databases miss", async () => {
    offLookup.mockRejectedValue(
      new FoodApiError("not-found", "Product not found."),
    );
    usdaLookup.mockRejectedValue(
      new FoodApiError("not-found", "Product not found."),
    );

    const response = await lookup();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "search.barcodeNotFound",
    });
  });

  it("does not claim a miss when OFF misses but USDA is down", async () => {
    offLookup.mockRejectedValue(
      new FoodApiError("not-found", "Product not found."),
    );
    usdaLookup.mockRejectedValue(
      new FoodApiError("unavailable", "USDA is down."),
    );

    const response = await lookup();

    expect(response.status).toBe(503);
    expect((await response.json()).error).not.toBe("search.barcodeNotFound");
  });

  it("skips USDA when the user turned it off", async () => {
    viewerMock.mockResolvedValue({
      ...viewer,
      profile: { usdaEnabled: false },
    } as never);
    offLookup.mockRejectedValue(
      new FoodApiError("not-found", "Product not found."),
    );

    const response = await lookup();

    expect(response.status).toBe(404);
    expect(usdaLookup).not.toHaveBeenCalled();
  });
});
