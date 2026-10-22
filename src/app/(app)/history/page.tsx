import Link from "next/link";
import { Icon } from "@/components/icons";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import {
  addDays,
  formatShortDate,
  formatWeekRange,
  isToday,
  parseDateParam,
  startOfWeek,
  todayIso,
  weekDates,
} from "@/lib/dates";
import {
  formatGrams,
  formatKcal,
  formatNumber,
} from "@/lib/format";
import { pageMetadata } from "@/lib/pageMetadata";
import { getWeekTotals } from "@/lib/repositories/diary";
import type { DiaryTotals } from "@/lib/types";

export async function generateMetadata() {
  return pageMetadata("nav.history");
}

function sumValues(
  days: Awaited<ReturnType<typeof getWeekTotals>>,
  key: "kcal" | "protein" | "carbs" | "fat",
): { value: number | null; partial: boolean } {
  let value = 0;
  let known = 0;
  let missing = 0;
  for (const day of days) {
    const total = day.totals.nutrients[key];
    if (total.value !== null) {
      value += total.value;
      known += 1;
    }
    missing += total.missingEntries;
  }
  return {
    value: known > 0 ? value : null,
    partial: missing > 0,
  };
}

function dayStatus(
  totals: DiaryTotals,
  entryCount: number,
  t: ReturnType<typeof getTranslator>,
) {
  if (entryCount === 0) return t("history.noEntries");
  if (totals.nutrients.kcal.value === null) return t("common.unknown");
  if (totals.nutrients.kcal.missingEntries > 0) return t("history.partial");
  return null;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  const language = viewer.profile.language;
  const today = todayIso();
  const params = await searchParams;
  const selected = parseDateParam(params.week, today);
  const weekStart = startOfWeek(selected);
  const dates = weekDates(weekStart);
  const days = await getWeekTotals(viewer.user.id, dates);

  const hasEntries = days.some((day) => day.entryCount > 0);
  const daysLogged = days.filter((day) => day.entryCount > 0).length;
  const kcal = sumValues(days, "kcal");
  const protein = sumValues(days, "protein");
  const carbs = sumValues(days, "carbs");
  const fat = sumValues(days, "fat");
  const daysWithKcal = days.filter(
    (day) => day.totals.nutrients.kcal.value !== null,
  ).length;
  const totalEntries = days.reduce((sum, day) => sum + day.entryCount, 0);
  const average =
    kcal.value !== null && daysWithKcal > 0 ? kcal.value / daysWithKcal : null;
  const maxValue = Math.max(
    1,
    ...days.flatMap((day) => [
      day.totals.nutrients.kcal.value ?? 0,
      day.dayType?.kcal ?? 0,
    ]),
  );

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("history.title")}</p>
          <h1>{t("history.title")}</h1>
          <p className="page-subtitle">{t("history.subtitle")}</p>
        </div>
        <div className="week-nav">
          <Link
            href={`/history?week=${addDays(weekStart, -7)}`}
            className="icon-button"
            aria-label={t("history.previousWeek")}
            title={t("history.previousWeek")}
          >
            <Icon name="chevron-left" size={18} />
          </Link>
          <span className="week-range">
            {formatWeekRange(weekStart, language)}
          </span>
          <Link
            href={`/history?week=${addDays(weekStart, 7)}`}
            className="icon-button"
            aria-label={t("history.nextWeek")}
            title={t("history.nextWeek")}
          >
            <Icon name="chevron-right" size={18} />
          </Link>
          <Link
            href={`/history?week=${startOfWeek(today)}`}
            className="button secondary small"
          >
            {t("history.thisWeek")}
          </Link>
        </div>
      </div>

      <div className="stack">
        <div className="summary-cards">
          <div className="stat-card">
            <span>{t("history.totalCalories")}</span>
            <strong>
              {kcal.value === null
                ? t("common.unknown")
                : `${formatKcal(kcal.value, language)} kcal`}
              {kcal.partial ? "*" : ""}
            </strong>
          </div>
          <div className="stat-card">
            <span>{t("history.averageCalories")}</span>
            <strong>
              {average === null
                ? t("common.unknown")
                : `${formatKcal(average, language)} kcal`}
            </strong>
          </div>
          <div className="stat-card">
            <span>{t("history.daysLogged")}</span>
            <strong>{daysLogged} / 7</strong>
          </div>
          <div className="stat-card">
            <span>{t("history.entries")}</span>
            <strong>{formatNumber(totalEntries, language, 0)}</strong>
          </div>
        </div>

        {!hasEntries ? (
          <p className="notice">
            <Icon name="info" size={17} />
            <span>{t("history.noDataWeek")}</span>
          </p>
        ) : null}

        <section className="card chart-card" aria-labelledby="week-chart-title">
          <div className="row-between">
            <h2 className="card-title" id="week-chart-title">
              {t("history.weekSummary")} ·{" "}
              {formatWeekRange(weekStart, language)}
            </h2>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-swatch" />
                {t("history.loggedLabel")}
              </span>
              <span className="legend-item">
                <span className="legend-swatch target" />
                {t("history.targetLabel")}
              </span>
            </div>
          </div>

          <div
            className="week-chart"
            role="img"
            aria-label={t("history.chartAlt")}
          >
            {days.map((day) => {
              const consumed = day.totals.nutrients.kcal.value;
              const target = day.dayType?.kcal ?? null;
              const consumedHeight = consumed !== null ? (consumed / maxValue) * 100 : 0;
              const targetHeight = target !== null ? (target / maxValue) * 100 : 0;
              return (
                <div className="chart-col" key={day.date}>
                  <div className="chart-bars" aria-hidden="true">
                    {target !== null ? (
                      <div
                        className="chart-bar target"
                        style={{ height: `${Math.max(2, targetHeight)}%` }}
                        title={`${t("history.targetLabel")}: ${formatKcal(target, language)} kcal`}
                      />
                    ) : null}
                    {consumed !== null ? (
                      <div
                        className="chart-bar"
                        style={{ height: `${Math.max(2, consumedHeight)}%` }}
                        title={`${t("history.loggedLabel")}: ${formatKcal(consumed, language)} kcal`}
                      />
                    ) : null}
                  </div>
                  <div className="chart-label">
                    <strong>
                      {formatShortDate(day.date, language).split(" ")[0]}
                    </strong>
                    {day.totals.nutrients.kcal.value === null
                      ? day.entryCount === 0
                        ? "—"
                        : t("common.unknown")
                      : formatKcal(day.totals.nutrients.kcal.value, language)}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="source-note">{t("history.chartCaption")}</p>
          <p className="source-note">{t("history.dataNote")}</p>
          {days.some((day) => day.totals.nutrients.kcal.missingEntries > 0) ? (
            <p className="source-note">{t("history.incompleteNote")}</p>
          ) : null}
        </section>

        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">{t("history.chartTable")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("history.dayLabel")}</th>
                <th scope="col">{t("history.dayType")}</th>
                <th scope="col" className="numeric">
                  {t("history.entries")}
                </th>
                <th scope="col" className="numeric">
                  {t("history.loggedLabel")}
                </th>
                <th scope="col" className="numeric">
                  {t("history.targetLabel")}
                </th>
                <th scope="col" className="numeric">
                  {t("history.remaining")}
                </th>
                <th scope="col" className="numeric">
                  {t("nutrients.protein")}
                </th>
                <th scope="col" className="numeric">
                  {t("nutrients.carbs")}
                </th>
                <th scope="col" className="numeric">
                  {t("nutrients.fat")}
                </th>
                <th scope="col">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const consumed = day.totals.nutrients.kcal.value;
                const target = day.dayType?.kcal ?? null;
                const remaining =
                  consumed !== null && target !== null ? target - consumed : null;
                const status = dayStatus(day.totals, day.entryCount, t);
                return (
                  <tr key={day.date}>
                    <th scope="row">
                      <Link href={`/?date=${day.date}`}>
                        {formatShortDate(day.date, language)}
                      </Link>
                      {isToday(day.date) ? (
                        <span className="badge accent" style={{ marginLeft: 6 }}>
                          {t("history.today")}
                        </span>
                      ) : null}
                    </th>
                    <td>{day.dayType?.name ?? t("history.noType")}</td>
                    <td className="numeric">
                      {day.entryCount}
                      {status ? (
                        <span className="subtle"> · {status}</span>
                      ) : null}
                    </td>
                    <td className="numeric">
                      {consumed === null
                        ? "—"
                        : `${formatKcal(consumed, language)} kcal`}
                      {day.totals.nutrients.kcal.missingEntries > 0 ? "*" : ""}
                    </td>
                    <td className="numeric">
                      {target === null ? "—" : `${formatKcal(target, language)} kcal`}
                    </td>
                    <td className="numeric">
                      {remaining === null
                        ? "—"
                        : remaining < 0
                          ? t("history.over", {
                              value: formatNumber(
                                Math.abs(remaining),
                                language,
                                0,
                              ),
                            })
                          : t("history.under", {
                              value: formatNumber(remaining, language, 0),
                            })}
                    </td>
                    <td className="numeric">
                      {formatGrams(day.totals.nutrients.protein.value, language)}
                      {day.totals.nutrients.protein.missingEntries > 0 ? "*" : ""}
                    </td>
                    <td className="numeric">
                      {formatGrams(day.totals.nutrients.carbs.value, language)}
                      {day.totals.nutrients.carbs.missingEntries > 0 ? "*" : ""}
                    </td>
                    <td className="numeric">
                      {formatGrams(day.totals.nutrients.fat.value, language)}
                      {day.totals.nutrients.fat.missingEntries > 0 ? "*" : ""}
                    </td>
                    <td>
                      <Link href={`/?date=${day.date}`}>{t("history.viewDiary")}</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="summary-cards">
          <div className="stat-card">
            <span>{t("history.protein")}</span>
            <strong>
              {protein.value === null
                ? t("common.unknown")
                : `${formatGrams(protein.value, language)} g`}
              {protein.partial ? "*" : ""}
            </strong>
          </div>
          <div className="stat-card">
            <span>{t("history.carbs")}</span>
            <strong>
              {carbs.value === null
                ? t("common.unknown")
                : `${formatGrams(carbs.value, language)} g`}
              {carbs.partial ? "*" : ""}
            </strong>
          </div>
          <div className="stat-card">
            <span>{t("history.fat")}</span>
            <strong>
              {fat.value === null
                ? t("common.unknown")
                : `${formatGrams(fat.value, language)} g`}
              {fat.partial ? "*" : ""}
            </strong>
          </div>
          <div className="stat-card">
            <span>{t("history.targetLabel")}</span>
            <strong>
              {days.reduce((sum, day) => sum + (day.dayType?.kcal ?? 0), 0) > 0
                ? `${formatKcal(
                    days.reduce((sum, day) => sum + (day.dayType?.kcal ?? 0), 0),
                    language,
                  )} kcal`
                : "—"}
            </strong>
          </div>
        </div>
      </div>
    </>
  );
}
