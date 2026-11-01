import { RecipesView } from "@/components/recipes-view";
import { requireViewer } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { isUsdaConfigured } from "@/lib/env";
import {
  listCustomFoods,
  listFavoriteFoods,
  listRecentFoods,
} from "@/lib/repositories/foods";
import { listSavedMeals } from "@/lib/repositories/savedMeals";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("nav.recipes");
}

export default async function RecipesPage() {
  const viewer = await requireViewer();
  const [recipes, customFoods, favorites, recent] = await Promise.all([
    listSavedMeals(viewer.user.id),
    listCustomFoods(viewer.user.id),
    listFavoriteFoods(viewer.user.id),
    listRecentFoods(viewer.user.id, 30),
  ]);
  const foods = new Map<string, (typeof customFoods)[number]>();
  for (const food of [...customFoods, ...favorites, ...recent]) {
    if (food.id) foods.set(food.id, food);
  }
  return (
    <RecipesView
      recipes={recipes}
      foods={Array.from(foods.values())}
      today={todayIso()}
      language={viewer.profile.language}
      unitSystem={viewer.profile.unitSystem}
      usdaEnabled={viewer.profile.usdaEnabled && isUsdaConfigured()}
    />
  );
}
