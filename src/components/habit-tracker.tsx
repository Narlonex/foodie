"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHabitsAction } from "@/actions/insights";
import { getTranslator } from "@/i18n";
import { formatNumber } from "@/lib/format";
import type { HabitDay, Language } from "@/lib/types";
import { Icon } from "./icons";

export function HabitTracker({
  date,
  initial,
  waterTargetMl,
  language,
}: {
  date: string;
  initial: HabitDay | null;
  waterTargetMl: number;
  language: Language;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [values, setValues] = useState({
    waterMl: initial?.waterMl ?? 0,
    caffeineMg: initial?.caffeineMg ?? 0,
    alcoholUnits: initial?.alcoholUnits ?? 0,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(next: typeof values) {
    setError(null);
    setSaved(false);
    const previous = values;
    setValues(next);
    startTransition(async () => {
      const result = await saveHabitsAction({ date, ...next });
      if (!result.ok) {
        setValues(previous);
        setError(t("habits.error"));
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const waterPercent =
    waterTargetMl > 0
      ? Math.min(100, Math.round((values.waterMl / waterTargetMl) * 100))
      : 0;
  const hasValues =
    values.waterMl > 0 || values.caffeineMg > 0 || values.alcoholUnits > 0;

  return (
    <section className="card side-card habit-card">
      <div className="row-between">
        <div>
          <h2>{t("habits.title")}</h2>
          <p className="card-hint">{t("habits.help")}</p>
        </div>
        {saved ? (
          <span className="badge accent">{t("habits.saved")}</span>
        ) : null}
      </div>

      <div className="habit-water">
        <div className="row-between">
          <span>{t("habits.water")}</span>
          <strong>
            {formatNumber(values.waterMl, language, 0)} ml
          </strong>
        </div>
        <div className="habit-water-track">
          <span style={{ width: `${waterPercent}%` }} />
        </div>
        <div className="row-between">
          <small>
            {t("habits.target", { value: waterTargetMl })}
          </small>
          <small>{waterPercent}%</small>
        </div>
        <div className="habit-actions">
          <button
            type="button"
            className="button small secondary"
            disabled={pending}
            onClick={() => update({ ...values, waterMl: values.waterMl + 250 })}
          >
            <Icon name="plus" size={14} />
            250 ml
          </button>
          <button
            type="button"
            className="button small secondary"
            disabled={pending}
            onClick={() => update({ ...values, waterMl: values.waterMl + 500 })}
          >
            <Icon name="plus" size={14} />
            500 ml
          </button>
        </div>
      </div>

      <div className="habit-mini-grid">
        <div className="habit-mini">
          <span>
            <Icon name="coffee" size={15} />
            {t("habits.caffeine")}
          </span>
          <strong>{formatNumber(values.caffeineMg, language, 0)} mg</strong>
          <button
            type="button"
            className="icon-button small ghost"
            aria-label={t("habits.addCaffeine")}
            title={t("habits.addCaffeine")}
            disabled={pending}
            onClick={() =>
              update({ ...values, caffeineMg: values.caffeineMg + 80 })
            }
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
        <div className="habit-mini">
          <span>
            <Icon name="bowl" size={15} />
            {t("habits.alcohol")}
          </span>
          <strong>
            {formatNumber(values.alcoholUnits, language, 1)}{" "}
            {t("habits.units")}
          </strong>
          <button
            type="button"
            className="icon-button small ghost"
            aria-label={t("habits.addAlcohol")}
            title={t("habits.addAlcohol")}
            disabled={pending}
            onClick={() =>
              update({
                ...values,
                alcoholUnits: Math.round((values.alcoholUnits + 1) * 10) / 10,
              })
            }
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      {hasValues ? (
        <button
          type="button"
          className="habit-reset"
          disabled={pending}
          onClick={() =>
            update({ waterMl: 0, caffeineMg: 0, alcoholUnits: 0 })
          }
        >
          {t("habits.reset")}
        </button>
      ) : null}
    </section>
  );
}
