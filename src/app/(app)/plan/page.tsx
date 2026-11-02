import { MealPlannerView } from "@/components/meal-planner-view";
import { requireViewer } from "@/lib/auth";
import { parseDateParam, startOfWeek, todayIso, weekDates } from "@/lib/dates";
import { listPlanItems, listPantryItems, listShoppingItems } from "@/lib/repositories/mealPlanner";
import { listSavedMeals } from "@/lib/repositories/savedMeals";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("plan.title");
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const today = todayIso();
  const weekStart = startOfWeek(parseDateParam(params.week, today));
  const dates = weekDates(weekStart);

  const [items, recipes, shopping, pantry] = await Promise.all([
    listPlanItems(viewer.user.id, dates[0]!, dates[6]!),
    listSavedMeals(viewer.user.id),
    listShoppingItems(viewer.user.id),
    listPantryItems(viewer.user.id),
  ]);

  return (
    <MealPlannerView
      weekStart={weekStart}
      today={today}
      items={items}
      recipes={recipes}
      shopping={shopping}
      pantry={pantry}
      language={viewer.profile.language}
      unitSystem={viewer.profile.unitSystem}
    />
  );
}
