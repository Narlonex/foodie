"use client";

import { useMemo, useState, useTransition } from "react";
import { addSavedFoodAction } from "@/actions/foods";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { formatNumber, unitTranslationKey } from "@/lib/format";
import {
  fromBaseAmount,
  scaleNutrients,
  toBaseAmount,
} from "@/lib/nutrition";
import {
  MEALS,
  type Food,
  type Language,
  type Meal,
  type UnitSystem,
} from "@/lib/types";
import { Dialog } from "./dialog";
import { Icon } from "./icons";

export function QuickAddFoodDialog({
  food,
  date,
  initialMeal,
  language,
  unitSystem,
  onClose,
  onDone,
}: {
  food: Food;
  date: string;
  initialMeal: Meal;
  language: Language;
  unitSystem: UnitSystem;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const defaultUnit =
    food.basisType === "serving"
      ? "serving"
      : food.basisType === "100ml"
        ? unitSystem === "imperial"
          ? "floz"
          : "ml"
        : unitSystem === "imperial"
          ? "oz"
          : "g";
  const baseDefault =
    food.basisType === "serving" ? 1 : 100;
  const displayDefault = fromBaseAmount(
    baseDefault,
    food.basisType === "serving" ? "serving" : food.basisType === "100ml" ? "ml" : "g",
    unitSystem,
  );
  const [amount, setAmount] = useState(
    formatNumber(displayDefault.value, language, 2),
  );
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [targetDate, setTargetDate] = useState(date);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => {
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    try {
      const base = toBaseAmount(
        parsed,
        defaultUnit as "g" | "ml" | "oz" | "floz" | "serving",
      );
      return scaleNutrients(food, base.amount, base.amountUnit);
    } catch {
      return null;
    }
  }, [amount, defaultUnit, food]);

  function add() {
    if (!preview) {
      setError(t("search.amountRequired"));
      return;
    }
    const parsed = Number(amount.replace(",", "."));
    const base = toBaseAmount(
      parsed,
      defaultUnit as "g" | "ml" | "oz" | "floz" | "serving",
    );
    setError(null);
    startTransition(async () => {
      const result = await addSavedFoodAction({
        foodId: food.id ?? "",
        date: targetDate,
        meal,
        amount: base.amount,
        amountUnit: base.amountUnit,
      });
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(t("search.added"));
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("search.quickAdd")}
      description={food.name}
      language={language}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="button"
            onClick={add}
            disabled={pending || !preview}
          >
            <Icon name="plus" size={16} />
            {pending ? t("common.saving") : t("search.add")}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="source-note">{t("search.quickAddHelp")}</p>
        <div className="field">
          <label htmlFor="quick-amount">{t("search.amount")}</label>
          <div className="row" style={{ alignItems: "stretch" }}>
            <input
              id="quick-amount"
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoComplete="off"
              data-autofocus
            />
            <span className="badge" style={{ minHeight: 44 }}>
              {t(unitTranslationKey(defaultUnit))}
            </span>
          </div>
          <p className="field-hint">
            {food.basisType === "serving"
              ? t("search.servingHint")
              : t("search.amountHint", {
                  unit: t(unitTranslationKey(defaultUnit)),
                })}
          </p>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="quick-date">{t("common.date")}</label>
            <input
              id="quick-date"
              type="date"
              className="input"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="quick-meal">{t("common.meal")}</label>
            <select
              id="quick-meal"
              className="select"
              value={meal}
              onChange={(event) => setMeal(event.target.value as Meal)}
            >
              {MEALS.map((option) => (
                <option value={option} key={option}>
                  {t(`meals.${option}` as TranslationKey)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="preview-panel">
          <strong className="small">{t("search.preview")}</strong>
          {preview ? (
            <div className="preview-grid">
              <PreviewStat
                label={t("nutrients.kcal")}
                value={preview.nutrients.kcal}
                language={language}
                unit="kcal"
              />
              <PreviewStat
                label={t("nutrients.protein")}
                value={preview.nutrients.protein}
                language={language}
                unit="g"
              />
              <PreviewStat
                label={t("nutrients.carbs")}
                value={preview.nutrients.carbs}
                language={language}
                unit="g"
              />
              <PreviewStat
                label={t("nutrients.fat")}
                value={preview.nutrients.fat}
                language={language}
                unit="g"
              />
            </div>
          ) : (
            <p className="field-error">{t("search.amountRequired")}</p>
          )}
        </div>
        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function PreviewStat({
  label,
  value,
  language,
  unit,
}: {
  label: string;
  value: number | null;
  language: Language;
  unit: string;
}) {
  const t = getTranslator(language);
  return (
    <div className="preview-stat">
      <span>{label}</span>
      <strong>
        {value === null
          ? t("common.unknown")
          : `${formatNumber(value, language, unit === "kcal" ? 0 : 1)} ${unit}`}
      </strong>
    </div>
  );
}
