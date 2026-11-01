import { describe, expect, it } from "vitest";
import { parseIngredientLine, parseRecipeHtml } from "@/lib/recipeImport";

describe("recipe import", () => {
  it("reads grams and kilograms without guessing cups", () => {
    expect(parseIngredientLine("200 g chicken breast")).toMatchObject({
      name: "chicken breast",
      amount: 200,
      unit: "g",
    });
    expect(parseIngredientLine("1/2 kg potatoes")).toMatchObject({
      name: "potatoes",
      amount: 500,
      unit: "g",
    });
    const cups = parseIngredientLine("2 cups rice");
    expect(cups.amount).toBeNull();
    expect(cups.unit).toBeNull();
    expect(cups.name).toContain("rice");
  });

  it("handles unicode fractions and comma decimals", () => {
    expect(parseIngredientLine("½ l milk")).toMatchObject({
      name: "milk",
      amount: 500,
      unit: "ml",
    });
    expect(parseIngredientLine("1,5 kg potatoes")).toMatchObject({
      amount: 1500,
      unit: "g",
    });
  });

  it("reads schema.org recipe JSON-LD", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebPage","name":"Dinner"},
        {"@type":"Recipe","name":"Chicken rice","recipeYield":"4 servings",
         "recipeIngredient":["300 g chicken breast","200 g rice","1 tbsp olive oil"]}
      ]}
      </script></head></html>`;
    const recipe = parseRecipeHtml(html, "https://example.com/recipe");
    expect(recipe).not.toBeNull();
    expect(recipe?.name).toBe("Chicken rice");
    expect(recipe?.servings).toBe(4);
    expect(recipe?.ingredients).toHaveLength(3);
    expect(recipe?.ingredients[0]).toMatchObject({
      name: "chicken breast",
      amount: 300,
      unit: "g",
    });
  });

  it("returns null when the page has no recipe data", () => {
    expect(parseRecipeHtml("<html><body>Hello</body></html>", "https://x.test")).toBeNull();
  });

  it("ignores malformed JSON-LD instead of throwing", () => {
    const html = `<script type="application/ld+json">{not json}</script>`;
    expect(parseRecipeHtml(html, "https://x.test")).toBeNull();
  });
});
