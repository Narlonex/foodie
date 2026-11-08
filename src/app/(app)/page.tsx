import { DashboardView } from "@/components/dashboard-view";
import { requireViewer } from "@/lib/auth";
import { addDays, parseDateParam, todayIso } from "@/lib/dates";
import { isUsdaConfigured } from "@/lib/env";
import { getDayTotals } from "@/lib/repositories/diary";
import { listDayTypes } from "@/lib/repositories/dayTypes";
import {
  listCustomFoods,
  listFavoriteFoods,
  listRecentFoods,
} from "@/lib/repositories/foods";
import { listSavedMeals } from "@/lib/repositories/savedMeals";
import { getHabitDay } from "@/lib/repositories/habits";
import { getLatestWeightEntries } from "@/lib/repositories/weight";
import { calculateWeightTrend } from "@/lib/weightTrend";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("nav.dashboard");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[]; quick?: string | string[] }>;
}) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const today = todayIso();
  const date = parseDateParam(params.date, today);
  const quickAdd = params.quick === "1";

  const [day, dayTypes, favorites, recent, customFoods, savedMeals, weights, habits] =
    await Promise.all([
      getDayTotals(viewer.user.id, date),
      listDayTypes(viewer.user.id),
      listFavoriteFoods(viewer.user.id),
      listRecentFoods(viewer.user.id, 12),
      listCustomFoods(viewer.user.id),
      listSavedMeals(viewer.user.id),
      getLatestWeightEntries(viewer.user.id, 30),
      getHabitDay(viewer.user.id, date),
    ]);
  const weightTrend = calculateWeightTrend(
    weights.filter((entry) => entry.date >= addDays(today, -14)),
  );

  return (
    <DashboardView
      key={date}
      date={date}
      today={today}
      quickAdd={quickAdd}
      language={viewer.profile.language}
      unitSystem={viewer.profile.unitSystem}
      assignedDayTypeId={day.assignedDayTypeId}
      dayTypes={dayTypes}
      defaultDayTypeId={viewer.profile.defaultDayTypeId}
      entries={day.entries}
      totals={day.totals}
      favorites={favorites}
      recent={recent}
      customFoods={customFoods}
      savedMeals={savedMeals}
      latestWeight={weights.at(-1) ?? null}
      weightChangePerWeekKg={weightTrend?.changePerWeekKg ?? null}
      habits={habits}
      waterTargetMl={Math.min(
        4_000,
        Math.max(
          1_500,
          Math.round((((viewer.profile.weightKg ?? 75) * 30) / 250)) * 250,
        ),
      )}
      usdaEnabled={viewer.profile.usdaEnabled && isUsdaConfigured()}
      dashboardNutrients={viewer.profile.dashboardNutrients}
    />
  );
}
