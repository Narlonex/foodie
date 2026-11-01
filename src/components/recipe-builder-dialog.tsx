"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveFoodForRecipeAction } from "@/actions/foods";
import { saveMealAction } from "@/actions/savedMeals";
import { importRecipeAction } from "@/actions/recipeImport";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import {
  formatGrams,
  formatKcal,
  formatNumber,
  unitTranslationKey,
} from "@/lib/format";
import { fromBaseAmount, toBaseAmount } from "@/lib/nutrition";
import { recipeNutrition } from "@/lib/recipes";
import {
  basisLabel,
  type AmountUnit,
  type DiaryEntry,
  type Food,
  type FoodCandidate,
  type Language,
  type SavedMeal,
  type UnitSystem,
} from "@/lib/types";
import type { ImportedRecipe } from "@/lib/recipeImport";
import { Dialog } from "./dialog";
import { FoodThumb } from "./food-thumb";
import { Icon } from "./icons";
import { EmptyState, SourceBadge } from "./ui";

interface BuilderRow {
  key: string;
  foodId: string;
  amount: string;
}

function displayUnitFor(food: Food, unitSystem: UnitSystem): string {
  if (food.basisType === "serving") return "serving";
  if (food.basisType === "100ml") return unitSystem === "imperial" ? "floz" : "ml";
  return unitSystem === "imperial" ? "oz" : "g";
}

function defaultDisplayAmount(food: Food, unitSystem: UnitSystem): string {
  if (food.basisType === "serving") return "1";
  if (unitSystem === "imperial") return food.basisType === "100ml" ? "3.4" : "3.5";
  return "100";
}

function externalKey(food: Food | FoodCandidate): string {
  return `${food.source}:${food.externalId ?? food.barcode ?? food.name}`;
}

function mergeFoods(foods: Food[], savedMeal: SavedMeal | null): Food[] {
  const map = new Map<string, Food>();
  for (const food of foods) {
    if (food.id) map.set(food.id, food);
  }
  for (const item of savedMeal?.items ?? []) {
    if (item.food.id) map.set(item.food.id, item.food);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function rowsFromEntries(
  entries: DiaryEntry[],
  foods: Food[],
  unitSystem: UnitSystem,
  language: Language,
): BuilderRow[] {
  const byId = new Map(
    foods.flatMap((food) => (food.id ? [[food.id, food] as const] : [])),
  );
  const totals = new Map<string, { key: string; foodId: string; value: number }>();
  for (const entry of entries) {
    if (!entry.foodId) continue;
    const food = byId.get(entry.foodId);
    if (!food) continue;
    const baseUnit =
      food.basisType === "serving"
        ? "serving"
        : food.basisType === "100ml"
          ? "ml"
          : "g";
    if (entry.amountUnit !== baseUnit) continue;
    const converted = fromBaseAmount(entry.amount, entry.amountUnit, unitSystem);
    const existing = totals.get(entry.foodId);
    if (existing) {
      existing.value += converted.value;
      continue;
    }
    totals.set(entry.foodId, {
      key: entry.id,
      foodId: entry.foodId,
      value: converted.value,
    });
  }
  return Array.from(totals.values()).map((row) => ({
    key: row.key,
    foodId: row.foodId,
    amount: formatNumber(row.value, language, 2),
  }));
}

export function RecipeBuilderDialog({
  savedMeal,
  initialEntries = [],
  availableFoods,
  language,
  unitSystem,
  usdaEnabled = false,
  onClose,
  onDone,
}: {
  savedMeal: SavedMeal | null;
  initialEntries?: DiaryEntry[];
  availableFoods: Food[];
  language: Language;
  unitSystem: UnitSystem;
  usdaEnabled?: boolean;
  onClose: () => void;
  onDone: (message: string, recipe?: SavedMeal) => void;
}) {
  const t = getTranslator(language);
  const seedFoods = mergeFoods(availableFoods, savedMeal);
  const [foods, setFoods] = useState<Food[]>(seedFoods);
  const [name, setName] = useState(savedMeal?.name ?? "");
  const [finalWeight, setFinalWeight] = useState(
    savedMeal?.finalWeightG ? String(savedMeal.finalWeightG) : "",
  );
  const [servings, setServings] = useState(
    savedMeal?.servings ? String(savedMeal.servings) : "",
  );
  const [rows, setRows] = useState<BuilderRow[]>(() =>
    savedMeal
      ? savedMeal.items.map((item) => ({
          key: item.id,
          foodId: item.food.id ?? "",
          amount: formatNumber(
            fromBaseAmount(item.amount, item.amountUnit, unitSystem).value,
            language,
            2,
          ),
        }))
      : rowsFromEntries(initialEntries, seedFoods, unitSystem, language),
  );
  const [query, setQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [searchResults, setSearchResults] = useState<FoodCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [savingFoodKey, setSavingFoodKey] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => searchAbort.current?.abort();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      searchAbort.current?.abort();
      searchAbort.current = controller;
      setSearchStatus("loading");
      setSearchError(null);
      try {
        const response = await fetch(
          `/api/foods/search?q=${encodeURIComponent(trimmed)}&source=${usdaEnabled ? "both" : "off"}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          results?: FoodCandidate[];
          error?: string;
        };
        if (!response.ok) {
          setSearchResults([]);
          setSearchError(payload.error ?? "search.error");
          setSearchStatus("error");
          return;
        }
        setSearchResults(Array.isArray(payload.results) ? payload.results : []);
        setSearchStatus("done");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setSearchResults([]);
        setSearchError("search.networkError");
        setSearchStatus("error");
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [query, usdaEnabled]);

  const components = useMemo(() => {
    const list: {
      food: Food;
      amount: number;
      amountUnit: AmountUnit;
    }[] = [];
    for (const row of rows) {
      const food = foods.find((candidate) => candidate.id === row.foodId);
      if (!food) continue;
      const parsed = Number(row.amount.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) continue;
      try {
        const base = toBaseAmount(
          parsed,
          displayUnitFor(food, unitSystem) as
            | "g"
            | "ml"
            | "oz"
            | "floz"
            | "serving",
        );
        list.push({ food, amount: base.amount, amountUnit: base.amountUnit });
      } catch {
        // An invalid row simply does not contribute to the live preview.
      }
    }
    return list;
  }, [foods, rows, unitSystem]);

  const summary = useMemo(() => {
    if (components.length === 0) return null;
    const weight = Number(finalWeight.replace(",", "."));
    const portionCount = Number(servings.replace(",", "."));
    try {
      return recipeNutrition(
        components,
        Number.isFinite(weight) && weight > 0 ? weight : null,
        Number.isFinite(portionCount) && portionCount > 0 ? portionCount : null,
      );
    } catch {
      return null;
    }
  }, [components, finalWeight, servings]);

  function addFood(food: Food, amount?: string, keyPrefix = "row") {
    if (!food.id) return;
    if (rows.some((row) => row.foodId === food.id)) {
      setError(t("savedMeals.duplicateItem"));
      return;
    }
    const nextAmount = amount ?? defaultDisplayAmount(food, unitSystem);
    setFoods((current) =>
      current.some((candidate) => candidate.id === food.id)
        ? current
        : [...current, food].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setRows((current) => [
      ...current,
      {
        key: `${keyPrefix}-${Date.now()}-${current.length}`,
        foodId: food.id as string,
        amount: nextAmount,
      },
    ]);
    setError(null);
  }

  async function addSearchResult(food: FoodCandidate) {
    const key = externalKey(food);
    const existing = foods.find(
      (candidate) => candidate.source === food.source && candidate.externalId === food.externalId,
    );
    if (existing) {
      addFood(existing);
      setQuery("");
      setSearchResults([]);
      setSearchStatus("idle");
      setSearchError(null);
      return;
    }
    setSavingFoodKey(key);
    setSearchError(null);
    try {
      const result = await saveFoodForRecipeAction(food);
      if (!result.ok) {
        setSearchError(translate(language, result.error as TranslationKey));
        return;
      }
      if (!result.data) {
        setSearchError(t("savedMeals.saveError"));
        return;
      }
      addFood(result.data.food);
      setQuery("");
      setSearchResults([]);
      setSearchStatus("idle");
      setSearchError(null);
    } catch {
      setSearchError(t("savedMeals.saveError"));
    } finally {
      setSavingFoodKey(null);
    }
  }

  async function importRecipe() {
    setImporting(true);
    setImportError(null);
    setImported(null);
    try {
      const result = await importRecipeAction({ url: importUrl });
      if (!result.ok) {
        setImportError(translate(language, result.error as TranslationKey));
        return;
      }
      if (!result.data) {
        setImportError(t("recipeImport.noRecipe"));
        return;
      }
      setImported(result.data);
      if (result.data.name) setName(result.data.name);
      if (result.data.servings !== null) {
        setServings(String(result.data.servings));
      }
      setImportOpen(false);
    } catch {
      setImportError(t("recipeImport.fetchError"));
    } finally {
      setImporting(false);
    }
  }

  function updateRow(key: string, patch: Partial<BuilderRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function save() {
    setError(null);
    if (!name.trim()) {
      setError(t("validation.savedMealName"));
      return;
    }
    if (rows.length === 0) {
      setError(t("savedMeals.needItem"));
      return;
    }
    if (new Set(rows.map((row) => row.foodId)).size !== rows.length) {
      setError(t("savedMeals.duplicateItem"));
      return;
    }
    const parsedWeight =
      finalWeight.trim() === "" ? null : Number(finalWeight.replace(",", "."));
    if (
      parsedWeight !== null &&
      (!Number.isFinite(parsedWeight) || parsedWeight <= 0)
    ) {
      setError(t("validation.package"));
      return;
    }
    const parsedServings =
      servings.trim() === "" ? null : Number(servings.replace(",", "."));
    if (
      parsedServings !== null &&
      (!Number.isFinite(parsedServings) || parsedServings <= 0)
    ) {
      setError(t("validation.package"));
      return;
    }
    const items: { food: Food; amount: number; amountUnit: AmountUnit }[] = [];
    for (const row of rows) {
      const food = foods.find((candidate) => candidate.id === row.foodId);
      const parsed = Number(row.amount.replace(",", "."));
      if (!food || !Number.isFinite(parsed) || parsed <= 0) {
        setError(t("savedMeals.amountInvalid"));
        return;
      }
      try {
        const base = toBaseAmount(
          parsed,
          displayUnitFor(food, unitSystem) as
            | "g"
            | "ml"
            | "oz"
            | "floz"
            | "serving",
        );
        items.push({ food, ...base });
      } catch {
        setError(t("savedMeals.amountInvalid"));
        return;
      }
    }
    startTransition(async () => {
      const result = await saveMealAction({
        savedMealId: savedMeal?.id,
        name: name.trim(),
        items: items.map((item) => ({
          foodId: item.food.id as string,
          amount: item.amount,
          amountUnit: item.amountUnit,
        })),
        finalWeightG: parsedWeight,
        servings: parsedServings,
      });
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      const recipe: SavedMeal | undefined = result.data?.savedMealId
        ? {
            id: result.data.savedMealId,
            name: name.trim(),
            finalWeightG: parsedWeight,
            servings: parsedServings,
            items: items.map((item, index) => ({
              id: `local-${index}`,
              food: item.food,
              amount: item.amount,
              amountUnit: item.amountUnit,
            })),
          }
        : undefined;
      onDone(
        t(savedMeal ? "savedMeals.updated" : "savedMeals.created"),
        recipe,
      );
    });
  }

  const importLine = (ingredient: ImportedRecipe["ingredients"][number]) => {
    setQuery(ingredient.name);
    setImported(null);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={savedMeal ? t("savedMeals.edit") : t("savedMeals.new")}
      description={t("savedMeals.builderHelp")}
      language={language}
      size="wide"
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="button"
            onClick={save}
            disabled={pending}
          >
            {pending ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="recipe-import">
          <button
            type="button"
            className="button-link small"
            aria-expanded={importOpen}
            onClick={() => {
              setImportOpen((value) => !value);
              setImportError(null);
            }}
          >
            <Icon name="globe" size={15} />
            {importOpen ? t("recipeImport.close") : t("recipeImport.open")}
          </button>
          {importOpen ? (
            <div className="stack-sm recipe-import-panel">
              <p className="field-hint">{t("recipeImport.help")}</p>
              <div className="search-bar">
                <label className="sr-only" htmlFor="recipe-import-url">
                  {t("recipeImport.url")}
                </label>
                <input
                  id="recipe-import-url"
                  className="input"
                  type="url"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  placeholder="https://…"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="button small"
                  onClick={() => void importRecipe()}
                  disabled={importing || importUrl.trim() === ""}
                >
                  {importing ? t("recipeImport.loading") : t("recipeImport.import")}
                </button>
              </div>
              {importError ? (
                <p className="notice error" role="alert">
                  {importError}
                </p>
              ) : null}
            </div>
          ) : null}
          {imported ? (
            <div className="notice success" role="status">
              <Icon name="check" size={16} />
              <span>
                {t("recipeImport.imported", {
                  count: imported.ingredients.length,
                })}{" "}
                {t("recipeImport.review")}
              </span>
            </div>
          ) : null}
          {imported ? (
            <div className="imported-ingredients">
              {imported.ingredients.map((ingredient) => (
                <button
                  type="button"
                  className="imported-ingredient"
                  key={`${ingredient.text}-${ingredient.name}`}
                  onClick={() => importLine(ingredient)}
                >
                  <span>
                    <strong>{ingredient.name}</strong>
                    <small>{ingredient.text}</small>
                  </span>
                  <Icon name="search" size={15} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="saved-meal-name">{t("savedMeals.name")}</label>
            <input
              id="saved-meal-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("savedMeals.namePlaceholder")}
              data-autofocus
            />
          </div>
          <div className="field">
            <label htmlFor="recipe-final-weight">
              {t("recipes.finalWeight")}{" "}
              <span className="subtle">({t("common.optional")})</span>
            </label>
            <input
              id="recipe-final-weight"
              className="input"
              inputMode="decimal"
              value={finalWeight}
              onChange={(event) => setFinalWeight(event.target.value)}
              aria-describedby="recipe-weight-hint"
            />
          </div>
          <div className="field">
            <label htmlFor="recipe-servings">
              {t("recipes.servings")}{" "}
              <span className="subtle">({t("common.optional")})</span>
            </label>
            <input
              id="recipe-servings"
              className="input"
              inputMode="decimal"
              value={servings}
              onChange={(event) => setServings(event.target.value)}
            />
          </div>
          <p className="field-hint span-2" id="recipe-weight-hint">
            {t("recipes.finalWeightHelp")}
          </p>
        </div>

        <div className="stack-sm">
          <span className="field-label">{t("savedMeals.items")}</span>
          {rows.length === 0 ? (
            <EmptyState icon="bowl" title={t("savedMeals.needItem")}>
              {t("savedMeals.builderSearchHelp")}
            </EmptyState>
          ) : (
            rows.map((row) => {
              const food = foods.find((candidate) => candidate.id === row.foodId);
              const unit = food ? displayUnitFor(food, unitSystem) : "g";
              return (
                <div className="meal-builder-row" key={row.key}>
                  <div className="field food-select">
                    <label className="sr-only" htmlFor={`item-food-${row.key}`}>
                      {t("savedMeals.selectFood")}
                    </label>
                    <select
                      id={`item-food-${row.key}`}
                      className="select"
                      value={row.foodId}
                      onChange={(event) => {
                        const selected = foods.find(
                          (candidate) => candidate.id === event.target.value,
                        );
                        updateRow(row.key, {
                          foodId: event.target.value,
                          amount: selected
                            ? defaultDisplayAmount(selected, unitSystem)
                            : row.amount,
                        });
                      }}
                    >
                      {foods.map((candidate) => (
                        <option
                          value={candidate.id}
                          key={candidate.id}
                          disabled={
                            candidate.id !== row.foodId &&
                            rows.some((other) => other.foodId === candidate.id)
                          }
                        >
                          {candidate.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="sr-only" htmlFor={`item-amount-${row.key}`}>
                      {t("savedMeals.amount")}
                    </label>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <input
                        id={`item-amount-${row.key}`}
                        className="input"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(event) =>
                          updateRow(row.key, { amount: event.target.value })
                        }
                      />
                      <span className="badge">{t(unitTranslationKey(unit))}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-button small danger"
                    onClick={() =>
                      setRows((current) =>
                        current.filter((item) => item.key !== row.key),
                      )
                    }
                    aria-label={t("common.remove")}
                    title={t("common.remove")}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="recipe-search stack-sm">
          <label className="field-label" htmlFor="recipe-food-search">
            {t("savedMeals.addItem")}
          </label>
          <input
            id="recipe-food-search"
            className="input"
            type="search"
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (value.trim().length < 2) {
                setSearchResults([]);
                setSearchStatus("idle");
                setSearchError(null);
              }
            }}
            placeholder={t("savedMeals.searchPlaceholder")}
            autoComplete="off"
          />
          <p className="field-hint">{t("savedMeals.builderSearchHelp")}</p>
          {searchStatus === "loading" ? (
            <p className="field-hint">{t("search.loading")}</p>
          ) : null}
          {searchError ? (
            <p className="notice error" role="alert">
              {translate(language, searchError as TranslationKey)}
            </p>
          ) : null}
          {searchResults.length > 0 ? (
            <div className="result-list recipe-search-results">
              {searchResults.slice(0, 8).map((food) => {
                const key = externalKey(food);
                const kcal = food.nutrients.kcal;
                return (
                  <div className="result-row" key={key}>
                    <button
                      type="button"
                      className="result-button"
                      onClick={() => void addSearchResult(food)}
                      disabled={savingFoodKey !== null}
                    >
                      <FoodThumb name={food.name} imageUrl={food.imageUrl} />
                      <span className="result-main">
                        <span className="result-name">{food.name}</span>
                        <span className="result-meta">
                          <SourceBadge source={food.source} language={language} />
                          <span>
                            {kcal === null
                              ? t("search.unknown")
                              : `${formatKcal(kcal, language)} kcal`}{" "}
                            / {basisLabel(food.basisType, food.servingSize, food.servingUnit)}
                          </span>
                        </span>
                      </span>
                      <span className="result-kcal">
                        {savingFoodKey === key ? (
                          t("common.saving")
                        ) : (
                          <Icon name="plus" size={17} />
                        )}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : searchStatus === "done" ? (
            <p className="field-hint">{t("search.noResults")}</p>
          ) : null}
        </div>

        {summary ? (
          <div className="preview-panel">
            <div className="row-between">
              <strong className="small">{t("recipes.batchTotals")}</strong>
              <span className="badge">
                {summary.per100g !== null
                  ? t("recipes.per100Summary", {
                      kcal:
                        summary.per100g.kcal !== null
                          ? formatKcal(summary.per100g.kcal, language)
                          : t("common.unknown"),
                    })
                  : t("recipes.needFinalWeightHint")}
              </span>
            </div>
            <div className="kv-list">
              <div className="kv-row">
                <span>{t("recipes.batchKcalLabel")}</span>
                <strong>
                  {summary.batch.nutrients.kcal.value === null
                    ? t("common.unknown")
                    : `${formatKcal(summary.batch.nutrients.kcal.value, language)} kcal`}
                </strong>
              </div>
              {(["protein", "carbs", "fat"] as const).map((key) => {
                const value = summary.batch.nutrients[key].value;
                return (
                  <div className="kv-row" key={key}>
                    <span>{t(`nutrients.${key}` as TranslationKey)}</span>
                    <strong>
                      {value === null
                        ? t("common.unknown")
                        : `${formatGrams(value, language)} g`}
                    </strong>
                  </div>
                );
              })}
              {summary.perServing ? (
                <div className="kv-row">
                  <span>{t("recipes.perServingLabel")}</span>
                  <strong>
                    {summary.perServing.kcal === null
                      ? t("common.unknown")
                      : `${formatKcal(summary.perServing.kcal, language)} kcal`}
                  </strong>
                </div>
              ) : null}
              {summary.servingWeightGrams !== null ? (
                <div className="kv-row">
                  <span>{t("recipes.servingWeight")}</span>
                  <strong>
                    {formatNumber(summary.servingWeightGrams, language, 0)} g
                  </strong>
                </div>
              ) : null}
            </div>
            <p className="source-note">{t("recipes.weightCaveat")}</p>
            {summary.incomplete ? (
              <p className="notice warning">{t("recipes.incomplete")}</p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
