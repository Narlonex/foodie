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
vi.mock("@/lib/repositories/catalog", () => ({
  searchCatalogFoods: vi.fn(),
  recordCatalogSearchMiss: vi.fn(),
}));

import { GET } from "@/app/api/foods/search/route";
import { getViewer } from "@/lib/auth";
import { FoodApiError, searchOpenFoodFacts } from "@/lib/foods/openFoodFacts";
import { isUsdaEnabled, searchUsda } from "@/lib/foods/usda";
import {
  recordCatalogSearchMiss,
  searchCatalogFoods,
} from "@/lib/repositories/catalog";
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

function search(query: string, source: string, page = 1) {
  return GET(
    new NextRequest(
      `http://localhost/api/foods/search?q=${encodeURIComponent(query)}&source=${source}&page=${page}`,
    ),
  );
}

const offSearch = vi.mocked(searchOpenFoodFacts);
const usdaSearch = vi.mocked(searchUsda);
const catalogSearch = vi.mocked(searchCatalogFoods);
const recordMiss = vi.mocked(recordCatalogSearchMiss);
const usdaAvailable = vi.mocked(isUsdaEnabled);
const viewerMock = vi.mocked(getViewer);

beforeEach(() => {
  vi.resetAllMocks();
  viewerMock.mockResolvedValue(viewer as never);
  usdaAvailable.mockReturnValue(true);
  offSearch.mockResolvedValue([candidate("off", "off-1", "Chicken breast, cooked")]);
  usdaSearch.mockResolvedValue([candidate("usda", "usda-1", "Chicken breast")]);
  catalogSearch.mockResolvedValue([]);
  recordMiss.mockResolvedValue(undefined);
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

  it("passes the requested page to both databases", async () => {
    const response = await search("chicken breast", "both", 2);
    const payload = (await response.json()) as {
      page: number;
      hasMore: boolean;
    };

    expect(response.status).toBe(200);
    expect(offSearch).toHaveBeenCalledWith("chicken breast", 2);
    expect(usdaSearch).toHaveBeenCalledWith("chicken breast", 2);
    expect(payload.page).toBe(2);
    expect(payload.hasMore).toBe(false);
  });

  it("keeps local catalog results when an external source fails", async () => {
    catalogSearch.mockResolvedValue([
      { ...candidate("off", "local-1", "Chicken breast"), catalog: true },
    ]);
    offSearch.mockRejectedValue(new FoodApiError("unavailable", "OFF is down."));

    const response = await search("chicken breast", "off");
    const payload = (await response.json()) as { results: FoodCandidate[] };

    expect(response.status).toBe(200);
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]?.catalog).toBe(true);
  });

  it("browses a category without requiring a query", async () => {
    catalogSearch.mockResolvedValue([
      { ...candidate("off", "local-1", "Chicken breast"), catalog: true },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/foods/search?category=meat&source=off",
      ),
    );

    expect(response.status).toBe(200);
    expect(catalogSearch).toHaveBeenCalledWith(
      "",
      "off",
      40,
      expect.objectContaining({ category: "meat", offset: 0 }),
    );
  });

  it("records a zero-result search for the missing-food radar", async () => {
    catalogSearch.mockResolvedValue([]);
    offSearch.mockResolvedValue([]);

    const response = await search("unlisted food", "off");

    expect(response.status).toBe(200);
    expect(recordMiss).toHaveBeenCalledWith("unlisted food");
  });
});
