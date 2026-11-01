import { ProgressView } from "@/components/progress-view";
import { requireViewer } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/dates";
import { getWeekTotals } from "@/lib/repositories/diary";
import { getEffectiveDayType } from "@/lib/repositories/dayTypes";
import { listWeightEntries } from "@/lib/repositories/weight";
import { calculateAdaptiveCheckIn } from "@/lib/weightTrend";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("progress.title");
}

export default async function ProgressPage() {
  const viewer = await requireViewer();
  const today = todayIso();
  const dates = Array.from({ length: 21 }, (_, index) =>
    addDays(today, index - 20),
  );
  const [weights, totalsByDay, effective] = await Promise.all([
    listWeightEntries(viewer.user.id, addDays(today, -90)),
    getWeekTotals(viewer.user.id, dates),
    getEffectiveDayType(viewer.user.id, today),
  ]);
  const checkIn = calculateAdaptiveCheckIn({
    weights,
    intake: totalsByDay.map((day) => ({
      date: day.date,
      kcal: day.totals.nutrients.kcal.value,
      entryCount: day.entryCount,
    })),
    goalMode: viewer.profile.goalMode,
    today,
  });
  return (
    <ProgressView
      weights={weights}
      checkIn={checkIn}
      today={today}
      language={viewer.profile.language}
      currentTargetKcal={effective.dayType?.kcal ?? null}
      currentDayTypeName={effective.dayType?.name ?? null}
      hasDefaultDayType={viewer.profile.defaultDayTypeId !== null}
    />
  );
}
