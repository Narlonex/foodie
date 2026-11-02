"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMeasurementAction,
  saveMeasurementAction,
} from "@/actions/insights";
import { getTranslator } from "@/i18n";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import type { BodyMeasurement, Language } from "@/lib/types";
import { Icon } from "./icons";

function parseOptional(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

const FIELDS = [
  ["waistCm", "measurements.waist"],
  ["hipsCm", "measurements.hips"],
  ["chestCm", "measurements.chest"],
  ["thighCm", "measurements.thigh"],
  ["armCm", "measurements.arm"],
] as const;

export function MeasurementsCard({
  measurements,
  today,
  language,
}: {
  measurements: BodyMeasurement[];
  today: string;
  language: Language;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Record<string, string>>({
    waistCm: "",
    hipsCm: "",
    chestCm: "",
    thighCm: "",
    armCm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const parsed = Object.fromEntries(
      FIELDS.map(([key]) => [key, parseOptional(values[key] ?? "")]),
    ) as Record<string, number | null>;
    if (Object.values(parsed).some((value) => Number.isNaN(value))) {
      setError(t("measurements.invalid"));
      return;
    }
    if (Object.values(parsed).every((value) => value === null)) {
      setError(t("measurements.required"));
      return;
    }
    if (
      Object.values(parsed).some(
        (value) => value !== null && (value < 20 || value > 300),
      )
    ) {
      setError(t("measurements.invalid"));
      return;
    }
    startTransition(async () => {
      const result = await saveMeasurementAction({ date, ...parsed });
      if (!result.ok) {
        setError(t("measurements.error"));
        return;
      }
      setMessage(t("measurements.saved"));
      setValues({
        waistCm: "",
        hipsCm: "",
        chestCm: "",
        thighCm: "",
        armCm: "",
      });
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteMeasurementAction(id);
      setDeletingId(null);
      if (!result.ok) {
        setError(t("measurements.error"));
        return;
      }
      setMessage(t("measurements.deleted"));
      router.refresh();
    });
  }

  const waistPoints = measurements.filter(
    (entry) => entry.waistCm !== null,
  );
  const firstWaist = waistPoints[0]?.waistCm ?? null;
  const latestWaist = waistPoints.at(-1)?.waistCm ?? null;
  const waistChange =
    firstWaist !== null && latestWaist !== null
      ? latestWaist - firstWaist
      : null;

  return (
    <section className="card card-pad stack measurements-card">
      <div className="row-between">
        <div>
          <h2 className="card-title">{t("measurements.title")}</h2>
          <p className="card-hint">{t("measurements.help")}</p>
        </div>
        {waistChange !== null && Math.abs(waistChange) >= 0.1 ? (
          <span className="badge">
            {t("measurements.change", {
              value: `${waistChange > 0 ? "+" : "−"}${formatNumber(
                Math.abs(waistChange),
                language,
                1,
              )} cm`,
            })}
          </span>
        ) : null}
      </div>

      <form className="stack-sm" onSubmit={save}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="measurement-date">{t("measurements.date")}</label>
            <input
              id="measurement-date"
              className="input"
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          {FIELDS.map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`measurement-${key}`}>{t(label)}</label>
              <div className="input-suffix">
                <input
                  id={`measurement-${key}`}
                  className="input"
                  inputMode="decimal"
                  value={values[key] ?? ""}
                  onChange={(event) => change(key, event.target.value)}
                  placeholder="—"
                />
                <span>{t("measurements.cm")}</span>
              </div>
            </div>
          ))}
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="notice success" role="status">
            {message}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>
            <Icon name="ruler" size={16} />
            {pending ? t("common.saving") : t("measurements.save")}
          </button>
        </div>
      </form>

      {waistPoints.length >= 2 ? (
        <div className="measurement-chart">
          <div className="row-between">
            <strong>{t("measurements.chartTitle")}</strong>
            <span className="small muted">
              {formatShortDate(waistPoints[0]?.date ?? "", language)} –{" "}
              {formatShortDate(waistPoints.at(-1)?.date ?? "", language)}
            </span>
          </div>
          <MeasurementChart
            points={waistPoints}
            language={language}
            label={t("measurements.chartAria", {
              first: formatNumber(firstWaist ?? 0, language, 1),
              last: formatNumber(latestWaist ?? 0, language, 1),
            })}
          />
        </div>
      ) : null}

      {measurements.length === 0 ? (
        <p className="field-hint">{t("measurements.empty")}</p>
      ) : (
        <div className="measurement-history">
          {measurements
            .slice()
            .reverse()
            .map((entry) => (
              <div className="measurement-row" key={entry.id}>
                <div>
                  <strong>{formatLongDate(entry.date, language)}</strong>
                  <span>
                    {FIELDS.flatMap(([key, label]) => {
                      const value = entry[key];
                      return value === null
                        ? []
                        : [`${t(label)} ${formatNumber(value, language, 1)} cm`];
                    }).join(" · ")}
                  </span>
                </div>
                {deletingId === entry.id ? (
                  <span className="row">
                    <button
                      type="button"
                      className="button danger small"
                      onClick={() => void remove(entry.id)}
                      disabled={pending}
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
                    aria-label={t("measurements.delete")}
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
      <p className="source-note">{t("measurements.note")}</p>
    </section>
  );
}

function MeasurementChart({
  points,
  language,
  label,
}: {
  points: BodyMeasurement[];
  language: Language;
  label: string;
}) {
  const width = 640;
  const height = 150;
  const padX = 24;
  const padY = 18;
  const values = points.map((entry) => entry.waistCm ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const low = min - range * 0.15;
  const high = max + range * 0.15;
  const xFor = (index: number) =>
    padX + (index / Math.max(1, points.length - 1)) * (width - padX * 2);
  const yFor = (value: number) =>
    padY + ((high - value) / (high - low)) * (height - padY * 2);
  const line = points
    .map(
      (entry, index) =>
        `${index === 0 ? "M" : "L"}${xFor(index)},${yFor(entry.waistCm ?? 0)}`,
    )
    .join(" ");

  return (
    <div className="measurement-chart-svg">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <path d={line} className="weight-chart-line" />
        {points.map((entry, index) => (
          <circle
            key={entry.id}
            cx={xFor(index)}
            cy={yFor(entry.waistCm ?? 0)}
            r="3"
            className="weight-chart-dot"
          />
        ))}
      </svg>
      <div className="row-between">
        <span className="small muted">
          {formatNumber(values[0] ?? 0, language, 1)} cm
        </span>
        <span className="small muted">
          {formatNumber(values.at(-1) ?? 0, language, 1)} cm
        </span>
      </div>
    </div>
  );
}
