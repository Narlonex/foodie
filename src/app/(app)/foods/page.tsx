import { FoodLibraryView } from "@/components/food-library-view";
import { requireViewer } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import {
  listCustomFoods,
  listFavoriteFoods,
  listRecentFoods,
} from "@/lib/repositories/foods";
import { listSavedMeals } from "@/lib/repositories/savedMeals";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("nav.foodLibrary");
}

export default async function FoodsPage() {
  const viewer = await requireViewer();
  const [customFoods, favorites, recent, savedMeals] = await Promise.all([
    listCustomFoods(viewer.user.id),
    listFavoriteFoods(viewer.user.id),
    listRecentFoods(viewer.user.id, 20),
    listSavedMeals(viewer.user.id),
  ]);

  return (
    <FoodLibraryView
      language={viewer.profile.language}
      unitSystem={viewer.profile.unitSystem}
      today={todayIso()}
      customFoods={customFoods}
      favorites={favorites}
      recent={recent}
      savedMeals={savedMeals}
    />
  );
}
