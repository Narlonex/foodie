"use client";

import Link from "next/link";
import { useState } from "react";
import { getTranslator } from "@/i18n";
import { simulateWeight, type GoalProjection } from "@/lib/analytics";
import { formatLongDate } from "@/lib/dates";
import { formatKcal, formatNumber } from "@/lib/format";
import type { Language } from "@/lib/types";
import { Icon } from "./icons";

function signed(value: number, language: Language, digits = 2): string {
  const formatted = formatNumber(Math.abs(value), language, digits);
  if (Math.abs(value) < 0.005) return formatted;
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

export function GoalProjectionCard({
  projection,
  goalWeightKg,
  goalRateKgPerWeek,
  currentTargetKcal,
  maintenanceKcal,
  language,
}: {
  projection: GoalProjection | null;
  goalWeightKg: number | null;
  goalRateKgPerWeek: number | null;
  currentTargetKcal: number | null;
  maintenanceKcal: number | null;
  language: Language;
}) {
  const t = getTranslator(language);
  const defaultIntake = currentTargetKcal ?? maintenanceKcal ?? null;
  const [weeks, setWeeks] = useState(8);
  const [intake, setIntake] = useState(
    defaultIntake === null ? "" : String(defaultIntake),
  );

  const parsedIntake = Number(intake.replace(",", "."));
  const validIntake =
    Number.isFinite(parsedIntake) && parsedIntake >= 500 && parsedIntake <= 10_000;
  const simulated =
    projection && maintenanceKcal !== null && validIntake
      ? simulateWeight(
          projection.currentKg,
          maintenanceKcal,
          parsedIntake,
          weeks,
        )
      : null;
  const simulatedDelta =
    simulated === null || !projection
      ? null
      : Math.round((simulated - projection.currentKg) * 10) / 10;

  return (
    <section className="card card-pad stack goal-projection-card">
      <div className="row-between">
        <div>
          <h2 className="card-title">{t("projection.title")}</h2>
          <p className="card-hint">{t("projection.help")}</p>
        </div>
        <Link href="/settings/goals" className="button-link small">
          {t("projection.openGoals")}
        </Link>
      </div>

      {!projection ? (
        <p className="field-hint">{t("projection.noWeight")}</p>
      ) : (
        <>
          <div className="projection-stats">
            <div className="projection-stat">
              <span>{t("projection.current")}</span>
              <strong>
                {formatNumber(projection.currentKg, language, 1)}{" "}
                {t("units.kg")}
              </strong>
            </div>
            <div className="projection-stat">
              <span>{t("projection.goal")}</span>
              <strong>
                {goalWeightKg === null
                  ? "—"
                  : `${formatNumber(goalWeightKg, language, 1)} ${t("units.kg")}`}
              </strong>
              {goalRateKgPerWeek !== null ? (
                <small>
                  {t("projection.plannedPace", {
                    value: formatNumber(goalRateKgPerWeek, language, 2),
                  })}
                </small>
              ) : null}
            </div>
            <div className="projection-stat">
              <span>{t("projection.trend")}</span>
              <strong>
                {projection.changePerWeekKg === null
                  ? "—"
                  : `${signed(projection.changePerWeekKg, language)} ${t(
                      "progress.kgPerWeek",
                    )}`}
              </strong>
              <small>{t("insights.weighIns", { count: projection.points })}</small>
            </div>
            <div className="projection-stat">
              <span>{t("projection.fourWeeks")}</span>
              <strong>
                {projection.projectedFourWeeksKg === null
                  ? "—"
                  : `${formatNumber(
                      projection.projectedFourWeeksKg,
                      language,
                      1,
                    )} ${t("units.kg")}`}
              </strong>
            </div>
          </div>

          {goalWeightKg === null ? (
            <p className="notice">
              <Icon name="target" size={17} />
              <span>
                {t("projection.needGoal")}{" "}
                <Link href="/settings/goals">{t("projection.openGoals")}</Link>
              </span>
            </p>
          ) : projection.changePerWeekKg === null ? (
            <p className="field-hint">{t("projection.noTrend")}</p>
          ) : projection.directionMatches && projection.targetDate ? (
            <p className="notice success">
              <Icon name="check" size={17} />
              <span>
                {t("projection.targetDate", {
                  date: formatLongDate(projection.targetDate, language),
                })}
              </span>
            </p>
          ) : (
            <p className="notice warning">
              <Icon name="alert" size={17} />
              <span>
                {projection.directionMatches
                  ? t("projection.noTargetDate")
                  : t("projection.directionMismatch")}
              </span>
            </p>
          )}
        </>
      )}

      <div className="simulator">
        <div>
          <h3 className="field-label">{t("projection.simulator")}</h3>
          <p className="card-hint">{t("projection.simulatorHelp")}</p>
        </div>
        {!projection || maintenanceKcal === null ? (
          <p className="field-hint">{t("projection.needMaintenance")}</p>
        ) : (
          <>
            <div className="simulator-controls">
              <div className="field">
                <label htmlFor="simulator-intake">
                  {t("projection.simulatorIntake")}
                </label>
                <div className="input-suffix">
                  <input
                    id="simulator-intake"
                    className="input"
                    inputMode="decimal"
                    value={intake}
                    onChange={(event) => setIntake(event.target.value)}
                  />
                  <span>{t("units.kcal")}</span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="simulator-weeks">
                  {t("projection.simulatorWeeks")}
                </label>
                <select
                  id="simulator-weeks"
                  className="select"
                  value={weeks}
                  onChange={(event) => setWeeks(Number(event.target.value))}
                >
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                  <option value={12}>12</option>
                </select>
              </div>
            </div>
            {simulated === null ? (
              <p className="field-error">
                {t("search.amountRequired")}
              </p>
            ) : (
              <div className="simulator-result" role="status">
                <div>
                  <span>
                    {t("projection.simulatorResult", { weeks })}
                  </span>
                  <strong>
                    {formatNumber(simulated, language, 1)} {t("units.kg")}
                  </strong>
                  {simulatedDelta !== null ? (
                    <small>
                      {t("projection.changeFromToday", {
                        value: signed(simulatedDelta, language, 1),
                      })}
                    </small>
                  ) : null}
                </div>
                <span className="badge">
                  {formatKcal(parsedIntake, language)} kcal
                </span>
              </div>
            )}
            <p className="source-note">{t("projection.simulatorNote")}</p>
          </>
        )}
      </div>
    </section>
  );
}
