"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getTranslator, type TranslationKey, type Translator } from "@/i18n";
import {
  buildMetricSeries,
  type FoodAttribution,
  type HeatmapWeek,
  type InsightDay,
  type InsightMetric,
  type MealProtein,
  type QualitySummary,
  type WeeklyReview,
} from "@/lib/analytics";
import { addDays, formatShortDate } from "@/lib/dates";
import { formatGrams, formatKcal, formatNumber } from "@/lib/format";
import type { HabitDay, Language } from "@/lib/types";
import type { AdaptiveCheckIn } from "@/lib/weightTrend";
import { Icon } from "./icons";

const METRICS: Array<{
  key: InsightMetric;
  label: "nutrients.kcal" | "nutrients.protein" | "nutrients.carbs" | "nutrients.fat";
}> = [
  { key: "kcal", label: "nutrients.kcal" },
  { key: "protein", label: "nutrients.protein" },
  { key: "carbs", label: "nutrients.carbs" },
  { key: "fat", label: "nutrients.fat" },
];

function signed(value: number, language: Language, digits = 1): string {
  const formatted = formatNumber(Math.abs(value), language, digits);
  if (Math.abs(value) < 0.05) return formatted;
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

export function InsightsPanel({
  days,
  review,
  heatmap,
  streak,
  meals,
  foods,
  quality,
  habits,
  checkIn,
  language,
  today,
}: {
  days: InsightDay[];
  review: WeeklyReview;
  heatmap: HeatmapWeek[];
  streak: number;
  meals: MealProtein[];
  foods: FoodAttribution[];
  quality: QualitySummary;
  habits: HabitDay[];
  checkIn: AdaptiveCheckIn;
  language: Language;
  today: string;
}) {
  const t = getTranslator(language);
  return (
    <div className="stack insights-panel">
      <WeeklyReviewCard review={review} language={language} t={t} />
      <div className="insights-grid">
        <RollingChart days={days.slice(-30)} language={language} t={t} />
        <AdherenceHeatmap
          heatmap={heatmap}
          streak={streak}
          language={language}
          t={t}
        />
        <ProteinByMeal meals={meals} language={language} t={t} />
        <QualityCard quality={quality} language={language} t={t} />
        <FoodAttributionCard foods={foods} language={language} t={t} />
        <EnergyCard checkIn={checkIn} language={language} t={t} />
        <HabitTrend habits={habits} language={language} t={t} today={today} />
      </div>
    </div>
  );
}

function WeeklyReviewCard({
  review,
  language,
  t,
}: {
  review: WeeklyReview;
  language: Language;
  t: Translator;
}) {
  const weight =
    review.weightChangePerWeekKg === null
      ? null
      : `${signed(review.weightChangePerWeekKg, language, 2)} ${t("progress.kgPerWeek")}`;

  return (
    <section className="card card-pad insight-review">
      <div className="row-between">
        <div>
          <p className="eyebrow">{t("insights.weeklyReview")}</p>
          <h2 className="card-title">{t("insights.lastSevenDays")}</h2>
          <p className="card-hint">{t("insights.reviewHelp")}</p>
        </div>
        <span className="badge">{t("insights.period")}</span>
      </div>

      <div className="insight-review-grid">
        <div className="insight-review-stat">
          <span>{t("insights.averageIntake")}</span>
          <strong>
            {review.currentAverageKcal === null
              ? "—"
              : `${formatKcal(review.currentAverageKcal, language)} kcal`}
          </strong>
          <small>
            {review.averageDeltaKcal === null
              ? t("insights.noComparison")
              : t("insights.vsPrevious", {
                  value: `${review.averageDeltaKcal > 0 ? "+" : ""}${formatKcal(
                    review.averageDeltaKcal,
                    language,
                  )}`,
                })}
          </small>
        </div>
        <div className="insight-review-stat">
          <span>{t("insights.loggedDays")}</span>
          <strong>{review.currentLoggedDays} / 7</strong>
          <small>
            {t("insights.previousLogged", {
              count: review.previousLoggedDays,
            })}
          </small>
        </div>
        <div className="insight-review-stat">
          <span>{t("insights.withinTarget")}</span>
          <strong>{review.withinTargetDays} / 7</strong>
          <small>{t("insights.withinTargetHelp")}</small>
        </div>
        <div className="insight-review-stat">
          <span>{t("insights.weightTrend")}</span>
          <strong>{weight ?? "—"}</strong>
          <small>
            {review.weightEntries > 0
              ? t("insights.weighIns", { count: review.weightEntries })
              : t("insights.noWeight")}
          </small>
        </div>
      </div>

      <p className="insight-review-sentence">
        {!review.hasData
          ? t("insights.noData")
          : weight
            ? t("insights.reviewWithWeight", {
                avg: formatKcal(review.currentAverageKcal ?? 0, language),
                logged: review.currentLoggedDays,
                weight,
              })
            : t("insights.reviewNoWeight", {
                avg: formatKcal(review.currentAverageKcal ?? 0, language),
                logged: review.currentLoggedDays,
              })}
      </p>
    </section>
  );
}

function RollingChart({
  days,
  language,
  t,
}: {
  days: InsightDay[];
  language: Language;
  t: Translator;
}) {
  const [metric, setMetric] = useState<InsightMetric>("kcal");
  const series = useMemo(() => buildMetricSeries(days, metric), [days, metric]);
  const known = series.filter((point) => point.value !== null);
  const max = Math.max(
    1,
    ...known.map((point) => point.value ?? 0),
    ...series.map((point) => point.average ?? 0),
  );
  const width = 720;
  const height = 230;
  const padX = 26;
  const padY = 22;
  const xFor = (index: number) =>
    padX + (index / Math.max(1, series.length - 1)) * (width - padX * 2);
  const yFor = (value: number) =>
    height - padY - (value / max) * (height - padY * 2);
  const linePoints = series.flatMap((point, index) =>
    point.average === null
      ? []
      : [`${xFor(index)},${yFor(point.average)}`],
  );
  const line = linePoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
    .join(" ");
  const latestAverage =
    [...series].reverse().find((point) => point.average !== null)?.average ??
    null;
  const unit = metric === "kcal" ? "kcal" : "g";
  const labels = [0, 7, 14, 21, 29]
    .filter((index) => index < series.length)
    .map((index) => series[index]);

  return (
    <section className="card card-pad insight-card insight-card-wide">
      <div className="row-between">
        <div>
          <h2 className="card-title">{t("insights.rollingTitle")}</h2>
          <p className="card-hint">{t("insights.rollingHelp")}</p>
        </div>
        <span className="badge">{t("insights.period30")}</span>
      </div>

      <div
        className="insight-tabs"
        role="tablist"
        aria-label={t("insights.metric")}
      >
        {METRICS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={metric === entry.key}
            className={`insight-tab ${metric === entry.key ? "active" : ""}`}
            onClick={() => setMetric(entry.key)}
          >
            {t(entry.label)}
          </button>
        ))}
      </div>

      {known.length < 2 ? (
        <div className="insight-empty">
          <Icon name="chart" size={22} />
          <p>{t("insights.notEnoughData")}</p>
        </div>
      ) : (
        <div className={`insight-chart insight-chart-${metric}`}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={t("insights.chartAria", {
              metric: t(
                METRICS.find((entry) => entry.key === metric)?.label ??
                  "nutrients.kcal",
              ),
              days: series.length,
            })}
          >
            <line
              x1={padX}
              x2={width - padX}
              y1={height - padY}
              y2={height - padY}
              className="insight-chart-axis"
            />
            {[0.25, 0.5, 0.75].map((fraction) => (
              <line
                key={fraction}
                x1={padX}
                x2={width - padX}
                y1={padY + fraction * (height - padY * 2)}
                y2={padY + fraction * (height - padY * 2)}
                className="insight-chart-grid"
              />
            ))}
            {series.map((point, index) =>
              point.value === null ? null : (
                <rect
                  key={point.date}
                  x={xFor(index) - 3}
                  y={yFor(point.value)}
                  width="6"
                  height={height - padY - yFor(point.value)}
                  rx="2"
                  className="insight-chart-bar"
                />
              ),
            )}
            {line ? <path d={line} className="insight-chart-line" /> : null}
          </svg>
          <div className="insight-chart-labels">
            {labels.map((point) => (
              <span key={point?.date}>
                {point ? formatShortDate(point.date, language).split(" ")[0] : ""}
              </span>
            ))}
          </div>
          <div className="insight-chart-foot">
            <span className="legend-item">
              <span className="legend-swatch" />
              {t("insights.rollingAverage")}
            </span>
            <strong>
              {latestAverage === null
                ? "—"
                : `${formatNumber(
                    latestAverage,
                    language,
                    metric === "kcal" ? 0 : 1,
                  )} ${unit}`}
            </strong>
          </div>
        </div>
      )}
    </section>
  );
}

function AdherenceHeatmap({
  heatmap,
  streak,
  language,
  t,
}: {
  heatmap: HeatmapWeek[];
  streak: number;
  language: Language;
  t: Translator;
}) {
  return (
    <section className="card card-pad insight-card">
      <div className="row-between">
        <div>
          <h2 className="card-title">{t("insights.heatmapTitle")}</h2>
          <p className="card-hint">{t("insights.heatmapHelp")}</p>
        </div>
        <span className="badge">
          {t("insights.streakDays", { count: streak })}
        </span>
      </div>

      <div
        className="heatmap"
        role="img"
        aria-label={t("insights.heatmapAria")}
      >
        {heatmap.map((week) => (
          <div className="heatmap-week" key={week.days[0]?.date}>
            {week.days.map((day) => (
              <span
                key={day.date}
                className={`heatmap-cell ${day.status}`}
                title={`${formatShortDate(day.date, language)} · ${t(
                  `insights.status.${day.status}` as TranslationKey,
                )}`}
                aria-label={`${formatShortDate(day.date, language)} · ${t(
                  `insights.status.${day.status}` as TranslationKey,
                )}`}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="heatmap-legend">
        {(
          ["empty", "partial", "within", "outside", "unscored"] as const
        ).map((status) => (
          <span className="legend-item" key={status}>
            <span className={`heatmap-cell ${status}`} />
            {t(`insights.status.${status}` as TranslationKey)}
          </span>
        ))}
      </div>
    </section>
  );
}

function ProteinByMeal({
  meals,
  language,
  t,
}: {
  meals: MealProtein[];
  language: Language;
  t: Translator;
}) {
  const max = Math.max(30, ...meals.map((meal) => meal.averageGrams ?? 0));
  return (
    <section className="card card-pad insight-card">
      <div className="row-between">
        <div>
          <h2 className="card-title">{t("insights.proteinTitle")}</h2>
          <p className="card-hint">{t("insights.proteinHelp")}</p>
        </div>
      </div>
      <div className="protein-bars">
        {meals.map((meal) => (
          <div className="protein-row" key={meal.meal}>
            <span>{t(`meals.${meal.meal}` as TranslationKey)}</span>
            <div className="protein-track">
              <span
                className="protein-fill"
                style={{
                  width: `${Math.max(
                    2,
                    ((meal.averageGrams ?? 0) / max) * 100,
                  )}%`,
                }}
              />
            </div>
            <strong>
              {meal.averageGrams === null
                ? "—"
                : `${formatGrams(meal.averageGrams, language)} g`}
            </strong>
            <small>{t("insights.daysShort", { count: meal.loggedDays })}</small>
          </div>
        ))}
      </div>
      <p className="source-note">{t("insights.proteinNote")}</p>
    </section>
  );
}

function QualityCard({
  quality,
  language,
  t,
}: {
  quality: QualitySummary;
  language: Language;
  t: Translator;
}) {
  return (
    <section className="card card-pad insight-card">
      <div className="row-between">
        <div>
          <h2 className="card-title">{t("insights.qualityTitle")}</h2>
          <p className="card-hint">{t("insights.qualityHelp")}</p>
        </div>
        <span className="badge">
          {quality.knownDays} / {quality.totalDays}
        </span>
      </div>
      <div className="quality-list">
        {quality.metrics.map((metric) => (
          <div className="quality-row" key={metric.key}>
            <div className="quality-row-head">
              <span>
                {t(`insights.${metric.key}` as TranslationKey)}
              </span>
              <strong>
                {metric.average === null
                  ? "—"
                  : `${formatNumber(
                      metric.average,
                      language,
                      metric.unit === "%" ? 0 : 1,
                    )} ${metric.unit}`}
              </strong>
            </div>
            <div className="quality-track">
              <span
                className={`quality-fill ${
                  metric.mode === "atMost" && (metric.percent ?? 0) > 100
                    ? "over"
                    : ""
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(2, metric.percent ?? 0),
                  )}%`,
                }}
              />
            </div>
            <small>
              {t("insights.reference")}:{" "}
              {metric.mode === "atMost" ? "≤" : ""}
              {metric.reference} {metric.unit}
            </small>
          </div>
        ))}
      </div>
      <p className="source-note">{t("insights.qualityNote")}</p>
    </section>
  );
}

function FoodAttributionCard({
  foods,
  language,
  t,
}: {
  foods: FoodAttribution[];
  language: Language;
  t: Translator;
}) {
  return (
    <section className="card card-pad insight-card">
      <div className="row-between">
        <div>
          <h2 className="card-title">{t("insights.foodsTitle")}</h2>
          <p className="card-hint">{t("insights.foodsHelp")}</p>
        </div>
      </div>
      {foods.length === 0 ? (
        <div className="insight-empty">
          <Icon name="bowl" size={22} />
          <p>{t("insights.noFoods")}</p>
        </div>
      ) : (
        <div className="food-attribution">
          {foods.map((food, index) => (
            <div className="food-attribution-row" key={food.key}>
              <span className="food-attribution-rank">{index + 1}</span>
              <div className="food-attribution-copy">
                <div className="food-attribution-head">
                  <strong>{food.name}</strong>
                  <span>{formatKcal(food.kcal, language)} kcal</span>
                </div>
                <div className="food-attribution-track">
                  <span style={{ width: `${Math.max(2, food.share * 100)}%` }} />
                </div>
                <small>
                  {food.brand ? `${food.brand} · ` : ""}
                  {t("insights.timesLogged", { count: food.entries })}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="source-note">{t("insights.foodsNote")}</p>
    </section>
  );
}

function EnergyCard({
  checkIn,
  language,
  t,
}: {
  checkIn: AdaptiveCheckIn;
  language: Language;
  t: Translator;
}) {
  if (checkIn.status === "insufficient") {
    return (
      <section className="card card-pad insight-card">
        <h2 className="card-title">{t("insights.energyTitle")}</h2>
        <p className="card-hint">{t("insights.energyHelp")}</p>
        <p className="notice warning">
          <Icon name="info" size={17} />
          <span>{t("insights.energyInsufficient")}</span>
        </p>
        <Link href="/progress" className="insight-link">
          {t("insights.openProgress")}
          <Icon name="arrow-right" size={15} />
        </Link>
      </section>
    );
  }

  const net = checkIn.averageIntakeKcal - checkIn.estimatedTdeeKcal;
  return (
    <section className="card card-pad insight-card">
      <div className="row-between">
        <div>
          <h2 className="card-title">{t("insights.energyTitle")}</h2>
          <p className="card-hint">{t("insights.energyHelp")}</p>
        </div>
        <span className="badge">
          {checkIn.status === "ok" && checkIn.confidence === "good"
            ? t("insights.confidenceGood")
            : t("insights.confidenceLow")}
        </span>
      </div>
      <div className="checkin-stats">
        <div className="checkin-stat">
          <span>{t("insights.averageIntake")}</span>
          <strong>{formatKcal(checkIn.averageIntakeKcal, language)} kcal</strong>
        </div>
        <div className="checkin-stat">
          <span>{t("insights.estimatedTdee")}</span>
          <strong>{formatKcal(checkIn.estimatedTdeeKcal, language)} kcal</strong>
        </div>
        <div className={`checkin-stat ${net < 0 ? "accent" : ""}`}>
          <span>{t("insights.netBalance")}</span>
          <strong>
            {net === 0 ? "0" : `${net > 0 ? "+" : "−"}${formatKcal(
              Math.abs(net),
              language,
            )}`}{" "}
            kcal
          </strong>
          <small>
            {net < 0
              ? t("insights.deficit")
              : net > 0
                ? t("insights.surplus")
                : t("insights.balanced")}
          </small>
        </div>
      </div>
      <p className="source-note">{t("insights.energyNote")}</p>
    </section>
  );
}

function HabitTrend({
  habits,
  language,
  t,
  today,
}: {
  habits: HabitDay[];
  language: Language;
  t: Translator;
  today: string;
}) {
  const byDate = new Map(habits.map((day) => [day.date, day]));
  const dates = Array.from({ length: 14 }, (_, index) =>
    addDays(today, -(13 - index)),
  );
  const rows = dates.map((date) => byDate.get(date) ?? null);
  const known = rows.filter((row): row is HabitDay => row !== null);
  const maxWater = Math.max(1, ...known.map((row) => row.waterMl));
  const avg = (key: "waterMl" | "caffeineMg" | "alcoholUnits") =>
    known.length === 0
      ? null
      : known.reduce((sum, row) => sum + row[key], 0) / known.length;

  return (
    <section className="card card-pad insight-card insight-card-wide">
      <div className="row-between">
        <div>
          <h2 className="card-title">{t("insights.habitsTitle")}</h2>
          <p className="card-hint">{t("insights.habitsHelp")}</p>
        </div>
        <Link href="/" className="insight-link">
          {t("insights.logToday")}
          <Icon name="arrow-right" size={15} />
        </Link>
      </div>
      <div className="habit-trend">
        <div
          className="habit-bars"
          role="img"
          aria-label={t("insights.habitsChartAria")}
        >
          {rows.map((row, index) => (
            <span
              key={dates[index]}
              className={`habit-bar ${row ? "" : "empty"}`}
              style={{
                height: row
                  ? `${Math.max(4, (row.waterMl / maxWater) * 100)}%`
                  : "4px",
              }}
              title={
                row
                  ? `${formatShortDate(dates[index] ?? "", language)} · ${row.waterMl} ml`
                  : `${formatShortDate(dates[index] ?? "", language)} · ${t(
                      "insights.notLogged",
                    )}`
              }
            />
          ))}
        </div>
        <div className="habit-stats">
          <div>
            <span>{t("insights.waterAvg")}</span>
            <strong>
              {avg("waterMl") === null
                ? "—"
                : `${formatNumber(avg("waterMl") ?? 0, language, 0)} ml`}
            </strong>
          </div>
          <div>
            <span>{t("insights.caffeineAvg")}</span>
            <strong>
              {avg("caffeineMg") === null
                ? "—"
                : `${formatNumber(avg("caffeineMg") ?? 0, language, 0)} mg`}
            </strong>
          </div>
          <div>
            <span>{t("insights.alcoholAvg")}</span>
            <strong>
              {avg("alcoholUnits") === null
                ? "—"
                : `${formatNumber(avg("alcoholUnits") ?? 0, language, 1)}`}
            </strong>
          </div>
        </div>
      </div>
      <p className="source-note">{t("insights.habitsNote")}</p>
    </section>
  );
}
