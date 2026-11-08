"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyAdaptiveTargetAction,
  deleteWeightAction,
  saveWeightAction,
} from "@/actions/weight";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import { formatKcal, formatNumber } from "@/lib/format";
import type {
  BodyMeasurement,
  Language,
  MeasurementUnit,
  WeightEntry,
} from "@/lib/types";
import type { AdaptiveCheckIn } from "@/lib/weightTrend";
import type { GoalProjection } from "@/lib/analytics";
import { GoalProjectionCard } from "./goal-projection-card";
import { Icon } from "./icons";
import { MeasurementsCard } from "./measurements-card";

export function ProgressView({
  weights,
  checkIn,
  today,
  language,
  measurementUnit,
  currentTargetKcal,
  currentDayTypeName,
  hasDefaultDayType,
  projection,
  goalWeightKg,
  goalRateKgPerWeek,
  maintenanceKcal,
  measurements,
}: {
  weights: WeightEntry[];
  checkIn: AdaptiveCheckIn;
  today: string;
  language: Language;
  measurementUnit: MeasurementUnit;
  currentTargetKcal: number | null;
  currentDayTypeName: string | null;
  hasDefaultDayType: boolean;
  projection: GoalProjection | null;
  goalWeightKg: number | null;
  goalRateKgPerWeek: number | null;
  maintenanceKcal: number | null;
  measurements: BodyMeasurement[];
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [applying, startApplying] = useTransition();

  const latest = weights.at(-1) ?? null;

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const parsed = Number(weight.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 20 || parsed > 500) {
      setError(t("validation.weight"));
      return;
    }
    startTransition(async () => {
      const result = await saveWeightAction({ date, weightKg: parsed });
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      setWeight("");
      setMessage(t("progress.weightSaved"));
      router.refresh();
    });
  }

  async function remove(id: string) {
    setError(null);
    setMessage(null);
    const result = await deleteWeightAction(id);
    setDeletingId(null);
    if (!result.ok) {
      setError(translate(language, result.error as TranslationKey));
      return;
    }
    setMessage(t("progress.weightDeleted"));
    router.refresh();
  }

  function applyTarget() {
    setError(null);
    setMessage(null);
    startApplying(async () => {
      const result = await applyAdaptiveTargetAction();
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      setMessage(
        t("progress.applied", {
          value: formatKcal(result.data?.kcal ?? null, language),
        }),
      );
      router.refresh();
    });
  }

  return (
    <div className="stack progress-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("nav.progress")}</p>
          <h1>{t("progress.title")}</h1>
          <p className="page-subtitle">{t("progress.subtitle")}</p>
        </div>
        <div className="page-actions">
          <span className="badge">
            {latest
              ? t("progress.latestOn", {
                  date: formatShortDate(latest.date, language),
                })
              : t("progress.noEntries")}
          </span>
        </div>
      </div>

      <div className="progress-top-grid">
        <section className="card card-pad stack">
          <div className="row-between">
            <div>
              <h2 className="card-title">{t("progress.weight")}</h2>
              <p className="card-hint">{t("progress.weightHelp")}</p>
            </div>
            {latest ? (
              <div className="progress-latest">
                <strong>{formatNumber(latest.weightKg, language, 1)}</strong>
                <span>{t("units.kg")}</span>
              </div>
            ) : null}
          </div>
          <WeightChart weights={weights} language={language} t={t} />
        </section>

        <section className="card card-pad stack">
          <h2 className="card-title">{t("progress.addWeight")}</h2>
          <form className="stack-sm" onSubmit={save}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="weight-date">{t("progress.date")}</label>
                <input
                  id="weight-date"
                  className="input"
                  type="date"
                  value={date}
                  max={today}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="weight-value">{t("progress.weightKg")}</label>
                <div className="input-suffix">
                  <input
                    id="weight-value"
                    className="input"
                    inputMode="decimal"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    placeholder="75.0"
                    autoComplete="off"
                  />
                  <span>{t("units.kg")}</span>
                </div>
              </div>
            </div>
            {error ? (
              <p className="notice error" role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="notice success" role="status">
                {message}
              </p>
            ) : null}
            <button type="submit" className="button" disabled={pending}>
              <Icon name="plus" size={16} />
              {pending ? t("common.saving") : t("progress.saveWeight")}
            </button>
          </form>
          <p className="source-note">{t("progress.onePerDay")}</p>
        </section>
      </div>

      <GoalProjectionCard
        projection={projection}
        goalWeightKg={goalWeightKg}
        goalRateKgPerWeek={goalRateKgPerWeek}
        currentTargetKcal={currentTargetKcal}
        maintenanceKcal={maintenanceKcal}
        language={language}
      />

      <section className="card card-pad stack">
        <div className="row-between">
          <div>
            <h2 className="card-title">{t("progress.checkIn")}</h2>
            <p className="card-hint">{t("progress.checkInHelp")}</p>
          </div>
          <span className="badge">{t("progress.period", { days: 21 })}</span>
        </div>
        <CheckInCard
          checkIn={checkIn}
          language={language}
          t={t}
          currentTargetKcal={currentTargetKcal}
          currentDayTypeName={currentDayTypeName}
          hasDefaultDayType={hasDefaultDayType}
          applying={applying}
          onApply={applyTarget}
        />
      </section>

      <MeasurementsCard
        measurements={measurements}
        today={today}
        language={language}
        measurementUnit={measurementUnit}
      />

      <section className="card card-pad stack">
        <div className="row-between">
          <h2 className="card-title">{t("progress.history")}</h2>
          <span className="small muted">
            {t("progress.entriesCount", { count: weights.length })}
          </span>
        </div>
        {weights.length === 0 ? (
          <p className="field-hint">{t("progress.noHistory")}</p>
        ) : (
          <div className="weight-history">
            {weights
              .slice()
              .reverse()
              .slice(0, 10)
              .map((entry) => (
                <div className="weight-history-row" key={entry.id}>
                  <span>{formatLongDate(entry.date, language)}</span>
                  <strong>
                    {formatNumber(entry.weightKg, language, 1)} {t("units.kg")}
                  </strong>
                  {deletingId === entry.id ? (
                    <span className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="button danger small"
                        onClick={() => void remove(entry.id)}
                      >
                        {t("common.delete")}
                      </button>
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => setDeletingId(null)}
                      >
                        {t("common.cancel")}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="icon-button small ghost danger"
                      aria-label={t("progress.deleteWeight")}
                      title={t("common.delete")}
                      onClick={() => setDeletingId(entry.id)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CheckInCard({
  checkIn,
  language,
  t,
  currentTargetKcal,
  currentDayTypeName,
  hasDefaultDayType,
  applying,
  onApply,
}: {
  checkIn: AdaptiveCheckIn;
  language: Language;
  t: ReturnType<typeof getTranslator>;
  currentTargetKcal: number | null;
  currentDayTypeName: string | null;
  hasDefaultDayType: boolean;
  applying: boolean;
  onApply: () => void;
}) {
  if (checkIn.status === "insufficient") {
    return (
      <div className="stack-sm">
        <p className="notice warning">
          <Icon name="alert" size={17} />
          <span>{t("progress.insufficient")}</span>
        </p>
        <div className="checkin-requirements">
          <Requirement
            met={!checkIn.needsWeights}
            label={t("progress.needWeights", {
              count: checkIn.weightEntries,
            })}
          />
          <Requirement
            met={!checkIn.needsIntake}
            label={t("progress.needIntake", { count: checkIn.intakeDays })}
          />
          <Requirement
            met={!checkIn.needsSpan}
            label={t("progress.needSpan", { count: checkIn.spanDays })}
          />
        </div>
        <p className="source-note">{t("progress.insufficientHelp")}</p>
      </div>
    );
  }

  if (checkIn.status === "implausible") {
    return (
      <div className="stack-sm">
        <p className="notice warning">
          <Icon name="alert" size={17} />
          <span>
            {t("progress.implausible", {
              value: formatKcal(checkIn.estimatedTdeeKcal, language),
            })}
          </span>
        </p>
        <div className="checkin-stats">
          <Stat
            label={t("progress.averageIntake")}
            value={`${formatKcal(checkIn.averageIntakeKcal, language)} kcal`}
          />
          <Stat
            label={t("progress.weightTrend")}
            value={`${formatSigned(checkIn.weightChangePerWeekKg, language)} ${t("progress.kgPerWeek")}`}
          />
          <Stat
            label={t("progress.loggedDays")}
            value={`${checkIn.intakeDays} / ${checkIn.periodDays}`}
          />
        </div>
        <p className="source-note">{t("progress.implausibleHelp")}</p>
      </div>
    );
  }

  const delta =
    currentTargetKcal === null
      ? null
      : checkIn.suggestedKcal - currentTargetKcal;

  return (
    <div className="stack">
      <div className="checkin-stats">
        <Stat
          label={t("progress.averageIntake")}
          value={`${formatKcal(checkIn.averageIntakeKcal, language)} kcal`}
          hint={t("progress.loggedDaysValue", {
            logged: checkIn.intakeDays,
            total: checkIn.periodDays,
          })}
        />
        <Stat
          label={t("progress.weightTrend")}
          value={`${formatSigned(checkIn.weightChangePerWeekKg, language)} ${t("progress.kgPerWeek")}`}
          hint={t("progress.weighIns", { count: checkIn.weightEntries })}
        />
        <Stat
          label={t("progress.estimatedTdee")}
          value={`${formatKcal(checkIn.estimatedTdeeKcal, language)} kcal`}
          hint={t("progress.estimateHint")}
        />
        <Stat
          label={t("progress.suggested")}
          value={`${formatKcal(checkIn.suggestedKcal, language)} kcal`}
          hint={
            checkIn.confidence === "good"
              ? t("progress.confidenceGood")
              : t("progress.confidenceLow")
          }
          accent
        />
      </div>

      <div className="checkin-apply">
        <div>
          <strong>
            {currentDayTypeName
              ? t("progress.currentTarget", { name: currentDayTypeName })
              : t("progress.noCurrentTarget")}
          </strong>
          {currentTargetKcal !== null ? (
            <p className="field-hint">
              {formatKcal(currentTargetKcal, language)} kcal
              {delta !== null && Math.abs(delta) >= 10
                ? ` · ${delta > 0 ? "+" : ""}${formatKcal(delta, language)} kcal`
                : ""}
            </p>
          ) : null}
        </div>
        {hasDefaultDayType ? (
          <button
            type="button"
            className="button"
            onClick={onApply}
            disabled={applying}
          >
            <Icon name="target" size={16} />
            {applying ? t("common.saving") : t("progress.apply")}
          </button>
        ) : (
          <p className="field-hint">{t("progress.noDefaultDayType")}</p>
        )}
      </div>
      <p className="source-note">{t("progress.applyWarning")}</p>
    </div>
  );
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <span className={`checkin-requirement ${met ? "met" : ""}`}>
      <Icon name={met ? "check" : "alert"} size={14} />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`checkin-stat ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function formatSigned(value: number, language: Language): string {
  const formatted = formatNumber(Math.abs(value), language, 2);
  if (Math.abs(value) < 0.005) return formatted;
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

function WeightChart({
  weights,
  language,
  t,
}: {
  weights: WeightEntry[];
  language: Language;
  t: ReturnType<typeof getTranslator>;
}) {
  const points = weights.slice(-60);
  if (points.length === 0) {
    return (
      <div className="weight-chart-empty">
        <Icon name="chart" size={22} />
        <p>{t("progress.noChart")}</p>
      </div>
    );
  }
  if (points.length === 1) {
    return (
      <div className="weight-chart-empty">
        <strong>
          {formatNumber(points[0]?.weightKg ?? 0, language, 1)} kg
        </strong>
        <p>{t("progress.needMorePoints")}</p>
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padX = 30;
  const padY = 24;
  const values = points.map((point) => point.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.5, max - min);
  const low = min - range * 0.15;
  const high = max + range * 0.15;
  const xFor = (index: number) =>
    padX + (index / (points.length - 1)) * (width - padX * 2);
  const yFor = (value: number) =>
    padY + ((high - value) / (high - low)) * (height - padY * 2);
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index)},${yFor(point.weightKg)}`)
    .join(" ");
  const area = `${line} L${xFor(points.length - 1)},${height - padY} L${xFor(0)},${height - padY} Z`;
  const last = points[points.length - 1];
  const first = points[0];

  return (
    <div className="weight-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("progress.chartAria", {
          first: formatNumber(first?.weightKg ?? 0, language, 1),
          last: formatNumber(last?.weightKg ?? 0, language, 1),
        })}
      >
        <line
          x1={padX}
          x2={width - padX}
          y1={height - padY}
          y2={height - padY}
          className="weight-chart-axis"
        />
        <line
          x1={padX}
          x2={width - padX}
          y1={padY}
          y2={padY}
          className="weight-chart-grid"
        />
        <line
          x1={padX}
          x2={width - padX}
          y1={height / 2}
          y2={height / 2}
          className="weight-chart-grid"
        />
        <path d={area} className="weight-chart-area" />
        <path d={line} className="weight-chart-line" />
        {points.map((point, index) => (
          <circle
            key={point.id}
            cx={xFor(index)}
            cy={yFor(point.weightKg)}
            r="3.5"
            className="weight-chart-dot"
          />
        ))}
      </svg>
      <div className="weight-chart-labels">
        <span>{formatShortDate(first?.date ?? "", language)}</span>
        <span>{formatShortDate(last?.date ?? "", language)}</span>
      </div>
      <p className="source-note">{t("progress.chartNote")}</p>
    </div>
  );
}
