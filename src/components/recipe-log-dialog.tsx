"use client";

import { useMemo, useState, useTransition } from "react";
import { logRecipeAction } from "@/actions/savedMeals";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { formatGrams, formatKcal, formatNumber } from "@/lib/format";
import { scaleNutrients } from "@/lib/nutrition";
import { gramsForServings, recipeNutrition } from "@/lib/recipes";
import {
  MEALS,
  type FoodNutrition,
  type Language,
  type Meal,
  type SavedMeal,
} from "@/lib/types";
import { Dialog } from "./dialog";
import { Icon } from "./icons";

/**
 * Logs a whole recipe as a single diary entry. Grams are the stored unit, so a
 * serving count is converted through the nominal serving weight and the exact
 * grams are shown before saving.
 */
export function RecipeLogDialog({
  recipe,
  date,
  initialMeal,
  language,
  onClose,
  onDone,
}: {
  recipe: SavedMeal;
  date: string;
  initialMeal: Meal;
  language: Language;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const summary = useMemo(
    () =>
      recipeNutrition(
        recipe.items.map((item) => ({
          food: item.food,
          amount: item.amount,
          amountUnit: item.amountUnit,
        })),
        recipe.finalWeightG,
        recipe.servings,
      ),
    [recipe],
  );

  const canUseServings = summary.servingWeightGrams !== null;
  const [mode, setMode] = useState<"grams" | "servings">("grams");
  const [amount, setAmount] = useState(() =>
    summary.per100g ? "100" : canUseServings ? "1" : "",
  );
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = Number(amount.replace(",", "."));
  const grams =
    mode === "servings"
      ? canUseServings && Number.isFinite(parsed)
        ? gramsForServings(summary.servingWeightGrams, parsed)
        : null
      : Number.isFinite(parsed) && parsed > 0
        ? Math.round(parsed * 1000) / 1000
        : null;

  const preview = useMemo(() => {
    if (!summary.per100g || grams === null) return null;
    const reference: FoodNutrition = {
      basisType: "100g",
      servingSize: null,
      servingUnit: null,
      nutrients: summary.per100g,
      energySource: summary.energySource,
    };
    try {
      return scaleNutrients(reference, grams, "g");
    } catch {
      return null;
    }
  }, [grams, summary]);

  function submit() {
    setError(null);
    if (grams === null || grams <= 0) {
      setError(t("recipes.amountInvalid"));
      return;
    }
    if (!preview) {
      setError(t("recipes.needFinalWeight"));
      return;
    }
    startTransition(async () => {
      const result = await logRecipeAction({
        savedMealId: recipe.id,
        date,
        meal,
        grams,
      });
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(t("recipes.logged"));
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("recipes.logTitle", { name: recipe.name })}
      description={t("recipes.logIntro")}
      language={language}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="button"
            onClick={submit}
            disabled={pending || !preview}
          >
            <Icon name="plus" size={16} />
            {pending ? t("common.saving") : t("recipes.logConfirm")}
          </button>
        </>
      }
    >
      <div className="stack">
        {summary.per100g === null ? (
          <p className="notice warning" role="status">
            <Icon name="alert" size={17} />
            <span>{t("recipes.needFinalWeight")}</span>
          </p>
        ) : null}

        {canUseServings ? (
          <div className="segmented" role="group" aria-label={t("recipes.logMode")}>
            <button
              type="button"
              aria-pressed={mode === "grams"}
              onClick={() => {
                setMode("grams");
                setAmount("100");
                setError(null);
              }}
            >
              {t("recipes.byWeight")}
            </button>
            <button
              type="button"
              aria-pressed={mode === "servings"}
              onClick={() => {
                setMode("servings");
                setAmount("1");
                setError(null);
              }}
            >
              {t("recipes.byServing")}
            </button>
          </div>
        ) : null}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="recipe-amount">
              {mode === "servings" ? t("recipes.servings") : t("recipes.grams")}
            </label>
            <input
              id="recipe-amount"
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoComplete="off"
            />
            <p className="field-hint">
              {mode === "servings" && summary.servingWeightGrams !== null
                ? t("recipes.servingWeightHint", {
                    grams: formatNumber(summary.servingWeightGrams, language, 0),
                  })
                : t("recipes.gramsHint")}
            </p>
          </div>
          <div className="field">
            <label htmlFor="recipe-meal">{t("search.meal")}</label>
            <select
              id="recipe-meal"
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
          <div className="row-between">
            <strong className="small">{t("search.preview")}</strong>
            <span className="small subtle">
              {grams === null
                ? "—"
                : `${formatNumber(grams, language, 0)} g`}
            </span>
          </div>
          {preview ? (
            <div className="kv-list">
              <div className="kv-row">
                <span>{t("nutrients.kcal")}</span>
                <strong>{`${formatKcal(preview.nutrients.kcal, language)} kcal`}</strong>
              </div>
              {(["protein", "carbs", "fat"] as const).map((key) => (
                <div className="kv-row" key={key}>
                  <span>{t(`nutrients.${key}` as TranslationKey)}</span>
                  <strong>
                    {preview.nutrients[key] === null
                      ? t("common.unknown")
                      : `${formatGrams(preview.nutrients[key], language)} g`}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="field-error">{t("recipes.amountInvalid")}</p>
          )}
          <p className="source-note">{t("recipes.snapshotNote")}</p>
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
