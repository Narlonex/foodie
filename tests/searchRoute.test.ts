import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/foods/openFoodFacts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/foods/openFoodFacts")>();
  return { ...actual, searchOpenFoodFacts: vi.fn() };
});
vi.mock("@/lib/foods/usda", () => ({
  isUsdaEnabled: vi.fn(),
  searchUsda: vi.fn(),
}));

import { GET } from "@/app/api/foods/search/route";
import { getViewer } from "@/lib/auth";
import { FoodApiError, searchOpenFoodFacts } from "@/lib/foods/openFoodFacts";
import { isUsdaEnabled, searchUsda } from "@/lib/foods/usda";
import { EMPTY_NUTRIENTS, type FoodCandidate, type FoodSource } from "@/lib/types";

const viewer = {
  user: { id: "user-1", email: "person@example.com" },
  profile: { usdaEnabled: true },
};

function candidate(
  source: FoodSource,
  externalId: string,
  name: string,
): FoodCandidate {
  return {
    source,
    externalId,
    barcode: null,
    name,
    brand: null,
    basisType: "100g",
    servingSize: null,
    servingUnit: null,
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 120 },
    energySource: "provided",
    imageUrl: null,
    preparation: "unspecified",
    packageQuantity: null,
    packageUnit: null,
    drainedWeight: null,
  };
}

function search(query: string, source: string) {
  return GET(
    new NextRequest(
      `http://localhost/api/foods/search?q=${encodeURIComponent(query)}&source=${source}`,
    ),
  );
}

const offSearch = vi.mocked(searchOpenFoodFacts);
const usdaSearch = vi.mocked(searchUsda);
const usdaAvailable = vi.mocked(isUsdaEnabled);
const viewerMock = vi.mocked(getViewer);

beforeEach(() => {
  vi.resetAllMocks();
  viewerMock.mockResolvedValue(viewer as never);
  usdaAvailable.mockReturnValue(true);
  offSearch.mockResolvedValue([candidate("off", "off-1", "Chicken breast, cooked")]);
  usdaSearch.mockResolvedValue([candidate("usda", "usda-1", "Chicken breast")]);
});

describe("combined food search", () => {
  it("merges both databases into one ranked list", async () => {
    const response = await search("chicken breast", "both");
    const payload = (await response.json()) as {
      results: FoodCandidate[];
      unavailable: string[];
    };

    expect(response.status).toBe(200);
    expect(payload.results.map((food) => food.source)).toEqual(["usda", "off"]);
    expect(payload.unavailable).toEqual([]);
    expect(offSearch).toHaveBeenCalledOnce();
    expect(usdaSearch).toHaveBeenCalledOnce();
  });

  it("keeps the working database when the other one fails", async () => {
    usdaSearch.mockRejectedValue(
      new FoodApiError("unavailable", "USDA is down."),
    );

    const response = await search("chicken breast", "both");
    const payload = (await response.json()) as {
      results: FoodCandidate[];
      unavailable: string[];
    };

    expect(response.status).toBe(200);
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]?.source).toBe("off");
    expect(payload.unavailable).toEqual(["usda"]);
  });

  it("reports an error only when every database fails", async () => {
    offSearch.mockRejectedValue(new FoodApiError("unavailable", "OFF is down."));
    usdaSearch.mockRejectedValue(
      new FoodApiError("rate-limited", "USDA is throttling."),
    );

    const response = await search("chicken breast", "both");

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "food.rateLimited" });
  });

  it("skips USDA entirely when the user has it switched off", async () => {
    viewerMock.mockResolvedValue({
      ...viewer,
      profile: { usdaEnabled: false },
    } as never);

    const response = await search("chicken breast", "both");

    expect(response.status).toBe(200);
    expect(usdaSearch).not.toHaveBeenCalled();
  });
});
