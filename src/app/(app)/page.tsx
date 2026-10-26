import { DashboardView } from "@/components/dashboard-view";
import { requireViewer } from "@/lib/auth";
import { parseDateParam, todayIso } from "@/lib/dates";
import { isUsdaConfigured } from "@/lib/env";
import { getDayTotals } from "@/lib/repositories/diary";
import { listDayTypes } from "@/lib/repositories/dayTypes";
import {
  listCustomFoods,
  listFavoriteFoods,
  listRecentFoods,
} from "@/lib/repositories/foods";
import { listSavedMeals } from "@/lib/repositories/savedMeals";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("nav.dashboard");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const today = todayIso();
  const date = parseDateParam(params.date, today);

  const [day, dayTypes, favorites, recent, customFoods, savedMeals] =
    await Promise.all([
      getDayTotals(viewer.user.id, date),
      listDayTypes(viewer.user.id),
      listFavoriteFoods(viewer.user.id),
      listRecentFoods(viewer.user.id, 12),
      listCustomFoods(viewer.user.id),
      listSavedMeals(viewer.user.id),
    ]);

  return (
    <DashboardView
      date={date}
      today={today}
      language={viewer.profile.language}
      unitSystem={viewer.profile.unitSystem}
      dayType={day.dayType}
      assignedDayTypeId={day.assignedDayTypeId}
      dayTypes={dayTypes}
      defaultDayTypeId={viewer.profile.defaultDayTypeId}
      entries={day.entries}
      totals={day.totals}
      favorites={favorites}
      recent={recent}
      customFoods={customFoods}
      savedMeals={savedMeals}
      usdaEnabled={viewer.profile.usdaEnabled && isUsdaConfigured()}
      dashboardNutrients={viewer.profile.dashboardNutrients}
    />
  );
}
