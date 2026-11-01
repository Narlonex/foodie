"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSavedMealAction,
  duplicateSavedMealAction,
} from "@/actions/savedMeals";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import {
  formatKcal,
  formatNumber,
  formatPortion,
} from "@/lib/format";
import { recipeNutrition } from "@/lib/recipes";
import type {
  Food,
  Language,
  SavedMeal,
  UnitSystem,
} from "@/lib/types";
import { AddSavedMealDialog } from "./add-saved-meal-dialog";
import { Dialog } from "./dialog";
import { Icon } from "./icons";
import { RecipeBuilderDialog } from "./recipe-builder-dialog";
import { RecipeLogDialog } from "./recipe-log-dialog";
import { EmptyState } from "./ui";

export function RecipesView({
  recipes,
  foods,
  today,
  language,
  unitSystem,
  usdaEnabled,
}: {
  recipes: SavedMeal[];
  foods: Food[];
  today: string;
  language: Language;
  unitSystem: UnitSystem;
  usdaEnabled: boolean;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [builder, setBuilder] = useState<SavedMeal | "new" | null>(null);
  const [logging, setLogging] = useState<SavedMeal | null>(null);
  const [adding, setAdding] = useState<SavedMeal | null>(null);
  const [deleting, setDeleting] = useState<SavedMeal | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sortedFoods = useMemo(
    () =>
      [...foods]
        .filter((food) => food.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [foods],
  );

  async function duplicate(recipe: SavedMeal) {
    setDuplicating(recipe.id);
    const result = await duplicateSavedMealAction(recipe.id);
    setDuplicating(null);
    if (!result.ok) {
      setToast(translate(language, result.error as TranslationKey));
      return;
    }
    setToast(t("savedMeals.duplicated"));
    router.refresh();
  }

  function created(message: string, recipe?: SavedMeal) {
    setToast(message);
    setBuilder(null);
    if (recipe) setLogging(recipe);
    router.refresh();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("nav.recipes")}</p>
          <h1>{t("recipes.title")}</h1>
          <p className="page-subtitle">{t("recipes.subtitle")}</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="button"
            onClick={() => setBuilder("new")}
          >
            <Icon name="plus" size={17} />
            {t("recipes.create")}
          </button>
        </div>
      </div>

      {recipes.length === 0 ? (
        <div className="card card-pad">
          <EmptyState
            icon="utensils"
            title={t("recipes.empty")}
            action={
              <button
                type="button"
                className="button small"
                onClick={() => setBuilder("new")}
              >
                <Icon name="plus" size={16} />
                {t("recipes.create")}
              </button>
            }
          >
            {t("recipes.emptyHelp")}
          </EmptyState>
        </div>
      ) : (
        <div className="recipe-grid">
          {recipes.map((recipe) => {
            const summary = recipeNutrition(
              recipe.items.map((item) => ({
                food: item.food,
                amount: item.amount,
                amountUnit: item.amountUnit,
              })),
              recipe.finalWeightG,
              recipe.servings,
            );
            const per100Kcal = summary.per100g?.kcal ?? null;
            const batchKcal = summary.batch.nutrients.kcal.value;
            const servingKcal = summary.perServing?.kcal ?? null;
            const canLogGrams =
              summary.per100g !== null && recipe.finalWeightG !== null;
            return (
              <article className="card recipe-card" key={recipe.id}>
                <div className="recipe-card-head">
                  <div>
                    <h2>{recipe.name}</h2>
                    <p className="field-hint">
                      {t("recipes.ingredients", {
                        count: recipe.items.length,
                      })}
                      {recipe.finalWeightG !== null
                        ? ` · ${t("recipes.batchWeight", {
                            grams: formatNumber(
                              recipe.finalWeightG,
                              language,
                              0,
                            ),
                          })}`
                        : ` · ${t("recipes.noWeight")}`}
                      {recipe.servings !== null
                        ? ` · ${t("recipes.servingsCount", {
                            count: formatNumber(recipe.servings, language, 2),
                          })}`
                        : ""}
                    </p>
                  </div>
                  <div className="recipe-card-actions">
                    <button
                      type="button"
                      className="icon-button small"
                      onClick={() => void duplicate(recipe)}
                      disabled={duplicating === recipe.id}
                      aria-label={t("savedMeals.duplicate")}
                      title={t("savedMeals.duplicate")}
                    >
                      <Icon name="copy" size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button small"
                      onClick={() => setBuilder(recipe)}
                      aria-label={t("savedMeals.edit")}
                      title={t("common.edit")}
                    >
                      <Icon name="pencil" size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button small danger"
                      onClick={() => setDeleting(recipe)}
                      aria-label={t("common.delete")}
                      title={t("common.delete")}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>

                <div className="recipe-metrics">
                  <div>
                    <span>{t("recipes.perServingKcalShort")}</span>
                    <strong>
                      {servingKcal !== null
                        ? `${formatKcal(servingKcal, language)} kcal`
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>{t("recipes.per100Label")}</span>
                    <strong>
                      {per100Kcal !== null
                        ? `${formatKcal(per100Kcal, language)} kcal`
                        : t("common.unknown")}
                    </strong>
                  </div>
                  <div>
                    <span>{t("recipes.batchKcalLabel")}</span>
                    <strong>
                      {batchKcal !== null
                        ? `${formatKcal(batchKcal, language)} kcal`
                        : t("common.unknown")}
                    </strong>
                  </div>
                </div>

                <div className="saved-meal-items">
                  {recipe.items.map((item) => (
                    <span className="meal-chip" key={item.id}>
                      {item.food.name} ·{" "}
                      {formatPortion(
                        item.amount,
                        item.amountUnit,
                        unitSystem,
                        language,
                        t,
                      )}
                    </span>
                  ))}
                </div>

                {summary.incomplete ? (
                  <p className="source-note">{t("recipes.incomplete")}</p>
                ) : null}

                <div className="recipe-card-footer">
                  <button
                    type="button"
                    className="button small"
                    onClick={() =>
                      canLogGrams ? setLogging(recipe) : setAdding(recipe)
                    }
                  >
                    <Icon name="plus" size={15} />
                    {canLogGrams ? t("recipes.log") : t("savedMeals.addToDiary")}
                  </button>
                  {!canLogGrams ? (
                    <span className="source-note">{t("recipes.needFinalWeightHint")}</span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {builder ? (
        <RecipeBuilderDialog
          savedMeal={builder === "new" ? null : builder}
          availableFoods={sortedFoods}
          language={language}
          unitSystem={unitSystem}
          usdaEnabled={usdaEnabled}
          onClose={() => setBuilder(null)}
          onDone={created}
        />
      ) : null}

      {logging ? (
        <RecipeLogDialog
          recipe={logging}
          date={today}
          initialMeal="lunch"
          language={language}
          onClose={() => setLogging(null)}
          onDone={(message) => {
            setLogging(null);
            setToast(message);
            router.refresh();
          }}
        />
      ) : null}

      {adding ? (
        <AddSavedMealDialog
          savedMeals={[adding]}
          date={today}
          initialMeal="lunch"
          language={language}
          unitSystem={unitSystem}
          onClose={() => setAdding(null)}
          onDone={(message) => {
            setAdding(null);
            setToast(message);
            router.refresh();
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteRecipeDialog
          recipe={deleting}
          language={language}
          onClose={() => setDeleting(null)}
          onDone={(message) => {
            setDeleting(null);
            setToast(message);
            router.refresh();
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </>
  );
}

function DeleteRecipeDialog({
  recipe,
  language,
  onClose,
  onDone,
}: {
  recipe: SavedMeal;
  language: Language;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteSavedMealAction(recipe.id);
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(t("savedMeals.deleted"));
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("common.delete")}
      description={t("savedMeals.deleteConfirm", { name: recipe.name })}
      language={language}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="button danger"
            onClick={remove}
            disabled={pending}
          >
            {pending ? t("common.saving") : t("common.delete")}
          </button>
        </>
      }
    >
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
