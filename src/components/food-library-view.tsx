"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  createCustomFoodAction,
  deleteFoodAction,
  toggleFavoriteAction,
  updateCustomFoodAction,
} from "@/actions/foods";
import { saveMealAction, deleteSavedMealAction } from "@/actions/savedMeals";
import { initialFormState } from "@/actions/types";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { formatGrams, formatKcal, formatNumber, formatPortion, unitTranslationKey } from "@/lib/format";
import { fromBaseAmount, toBaseAmount } from "@/lib/nutrition";
import {
  NUTRIENT_KEYS,
  basisLabel,
  type AmountUnit,
  type Food,
  type Language,
  type NutrientKey,
  type SavedMeal,
  type UnitSystem,
} from "@/lib/types";
import { AddSavedMealDialog } from "./add-saved-meal-dialog";
import { Dialog } from "./dialog";
import { FoodPhotoField } from "./food-photo-field";
import { FoodThumb } from "./food-thumb";
import { Icon } from "./icons";
import { QuickAddFoodDialog } from "./quick-add-food-dialog";
import { EmptyState, SourceBadge } from "./ui";

type Tab = "custom" | "favorites" | "recent" | "meals";

function nutrientUnit(key: NutrientKey): string {
  if (key === "kcal") return "kcal";
  if (key === "kj") return "kJ";
  return "g";
}

function nutrientLabelKey(key: NutrientKey): string {
  return key === "satFat" ? "nutrients.saturatedFat" : `nutrients.${key}`;
}

export function FoodLibraryView({
  language,
  unitSystem,
  today,
  customFoods,
  favorites,
  recent,
  savedMeals,
}: {
  language: Language;
  unitSystem: UnitSystem;
  today: string;
  customFoods: Food[];
  favorites: Food[];
  recent: Food[];
  savedMeals: SavedMeal[];
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("custom");
  const [newFoodOpen, setNewFoodOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [deletingFood, setDeletingFood] = useState<Food | null>(null);
  const [quickFood, setQuickFood] = useState<Food | null>(null);
  const [builder, setBuilder] = useState<SavedMeal | "new" | null>(null);
  const [deletingMeal, setDeletingMeal] = useState<SavedMeal | null>(null);
  const [addingMeal, setAddingMeal] = useState<SavedMeal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [favoriteOverrides, setFavoriteOverrides] = useState<
    Record<string, boolean>
  >({});
  const [pendingFavorite, setPendingFavorite] = useState<string | null>(null);
  const serverFavoriteIds = useMemo(
    () => new Set(favorites.map((food) => food.id).filter(Boolean)),
    [favorites],
  );

  function isFavorite(food: Food): boolean {
    if (!food.id) return false;
    return favoriteOverrides[food.id] ?? serverFavoriteIds.has(food.id);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const allFoods = useMemo(() => {
    const map = new Map<string, Food>();
    for (const food of [...customFoods, ...favorites, ...recent]) {
      if (food.id) map.set(food.id, food);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [customFoods, favorites, recent]);

  function done(message: string) {
    setNewFoodOpen(false);
    setEditingFood(null);
    setDeletingFood(null);
    setBuilder(null);
    setDeletingMeal(null);
    setAddingMeal(null);
    setToast(message);
    router.refresh();
  }

  async function toggleFavorite(food: Food) {
    if (!food.id) return;
    const favorite = isFavorite(food);
    setPendingFavorite(food.id);
    const result = await toggleFavoriteAction(food.id, !favorite);
    setPendingFavorite(null);
    if (!result.ok) {
      setToast(translate(language, result.error as TranslationKey));
      return;
    }
    setFavoriteOverrides((current) => ({
      ...current,
      [food.id as string]: !favorite,
    }));
    setToast(t(favorite ? "foods.unfavorited" : "foods.favorited"));
    router.refresh();
  }

  const visibleFoods =
    tab === "custom" ? customFoods : tab === "favorites" ? favorites : recent;

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("nav.foodLibrary")}</p>
          <h1>{t("foods.title")}</h1>
          <p className="page-subtitle">{t("foods.subtitle")}</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="button"
            onClick={() => setNewFoodOpen(true)}
          >
            <Icon name="plus" size={17} />
            {t("foods.newFood")}
          </button>
        </div>
      </div>

      <div className="tab-bar" role="tablist" aria-label={t("foods.title")}>
        {(
          [
            ["custom", t("foods.customTab")],
            ["favorites", t("foods.favoritesTab")],
            ["recent", t("foods.recentTab")],
            ["meals", t("foods.savedMealsTab")],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "meals" ? (
        visibleFoods.length === 0 ? (
          <div className="card card-pad">
            <EmptyState
              icon={
                tab === "custom" ? "book" : tab === "favorites" ? "star" : "search"
              }
              title={
                tab === "custom"
                  ? t("foods.emptyCustom")
                  : tab === "favorites"
                    ? t("foods.emptyFavorites")
                    : t("foods.emptyRecent")
              }
              action={
                tab === "custom" ? (
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setNewFoodOpen(true)}
                  >
                    <Icon name="plus" size={16} />
                    {t("foods.newFood")}
                  </button>
                ) : null
              }
            >
              {tab === "custom"
                ? t("foods.emptyCustomHelp")
                : tab === "favorites"
                  ? t("foods.emptyFavoritesHelp")
                  : t("foods.emptyRecentHelp")}
            </EmptyState>
          </div>
        ) : (
          <div className="food-list">
            {visibleFoods.map((food) => (
              <FoodRow
                key={food.id ?? food.name}
                food={food}
                language={language}
                isFavorite={isFavorite(food)}
                favoritePending={pendingFavorite === food.id}
                onFavorite={() => void toggleFavorite(food)}
                onQuickAdd={() => setQuickFood(food)}
                onEdit={food.source === "custom" ? () => setEditingFood(food) : undefined}
                onDelete={food.source === "custom" ? () => setDeletingFood(food) : undefined}
                t={t}
              />
            ))}
          </div>
        )
      ) : (
        <div className="stack">
          <div className="row-between">
            <p className="muted small">{t("foods.emptyMealsHelp")}</p>
            <button
              type="button"
              className="button secondary small"
              onClick={() => setBuilder("new")}
              disabled={allFoods.length === 0}
            >
              <Icon name="plus" size={16} />
              {t("savedMeals.new")}
            </button>
          </div>
          {savedMeals.length === 0 ? (
            <div className="card card-pad">
              <EmptyState
                icon="book"
                title={t("savedMeals.empty")}
                action={
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setBuilder("new")}
                    disabled={allFoods.length === 0}
                  >
                    <Icon name="plus" size={16} />
                    {t("savedMeals.new")}
                  </button>
                }
              >
                {allFoods.length === 0
                  ? t("savedMeals.noAvailable")
                  : t("savedMeals.emptyHelp")}
              </EmptyState>
            </div>
          ) : (
            <div className="stack-sm">
              {savedMeals.map((meal) => (
                <article className="saved-meal-card" key={meal.id}>
                  <div className="row-between">
                    <div>
                      <strong>{meal.name}</strong>
                      <p className="field-hint">
                        {t("savedMeals.itemsCount", {
                          count: meal.items.length,
                        })}
                      </p>
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        type="button"
                        className="button small"
                        onClick={() => setAddingMeal(meal)}
                      >
                        <Icon name="plus" size={15} />
                        {t("savedMeals.addToDiary")}
                      </button>
                      <button
                        type="button"
                        className="icon-button small"
                        onClick={() => setBuilder(meal)}
                        aria-label={t("savedMeals.edit")}
                        title={t("common.edit")}
                      >
                        <Icon name="pencil" size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button small danger"
                        onClick={() => setDeletingMeal(meal)}
                        aria-label={t("common.delete")}
                        title={t("common.delete")}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="saved-meal-items">
                    {meal.items.length === 0 ? (
                      <span className="field-hint">{t("savedMeals.noItems")}</span>
                    ) : (
                      meal.items.map((item) => (
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
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {newFoodOpen ? (
        <CustomFoodDialog
          language={language}
          onClose={() => setNewFoodOpen(false)}
          onDone={done}
        />
      ) : null}

      {editingFood ? (
        <CustomFoodDialog
          food={editingFood}
          language={language}
          onClose={() => setEditingFood(null)}
          onDone={done}
        />
      ) : null}

      {deletingFood ? (
        <DeleteFoodDialog
          food={deletingFood}
          language={language}
          onClose={() => setDeletingFood(null)}
          onDone={done}
        />
      ) : null}

      {quickFood ? (
        <QuickAddFoodDialog
          food={quickFood}
          date={today}
          initialMeal="breakfast"
          language={language}
          unitSystem={unitSystem}
          onClose={() => setQuickFood(null)}
          onDone={done}
        />
      ) : null}

      {builder ? (
        <SavedMealBuilderDialog
          savedMeal={builder === "new" ? null : builder}
          availableFoods={allFoods}
          language={language}
          unitSystem={unitSystem}
          onClose={() => setBuilder(null)}
          onDone={done}
        />
      ) : null}

      {addingMeal ? (
        <AddSavedMealDialog
          savedMeals={[addingMeal]}
          date={today}
          initialMeal="breakfast"
          language={language}
          unitSystem={unitSystem}
          onClose={() => setAddingMeal(null)}
          onDone={done}
        />
      ) : null}

      {deletingMeal ? (
        <DeleteSavedMealDialog
          meal={deletingMeal}
          language={language}
          onClose={() => setDeletingMeal(null)}
          onDone={done}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      <p className="source-note" style={{ marginTop: 24 }}>
        {t("foods.manageHint")} ·{" "}
        <Link href="/settings/food-data">{t("settings.foodData")}</Link>
      </p>
    </>
  );
}

function FoodRow({
  food,
  language,
  isFavorite,
  favoritePending,
  onFavorite,
  onQuickAdd,
  onEdit,
  onDelete,
  t,
}: {
  food: Food;
  language: Language;
  isFavorite: boolean;
  favoritePending: boolean;
  onFavorite: () => void;
  onQuickAdd: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  t: ReturnType<typeof getTranslator>;
}) {
  const kcal = food.nutrients.kcal;
  return (
    <div className="food-list-item">
      <FoodThumb name={food.name} imageUrl={food.imageUrl} size={44} />
      <div className="food-main">
        <span className="food-name">{food.name}</span>
        <span className="food-meta">
          {food.brand ? <span>{food.brand}</span> : null}
          <SourceBadge source={food.source} language={language} />
          <span>{basisLabel(food.basisType, food.servingSize, food.servingUnit)}</span>
          {food.nutrients.protein === null ||
          food.nutrients.carbs === null ||
          food.nutrients.fat === null ? (
            <span>{t("history.partial")}</span>
          ) : null}
        </span>
        <span className="food-macros">
          <span>
            {kcal === null
              ? t("common.unknown")
              : `${formatKcal(kcal, language)} kcal`}
          </span>
          {food.nutrients.protein !== null ? (
            <span>P {formatGrams(food.nutrients.protein, language)} g</span>
          ) : null}
          {food.nutrients.carbs !== null ? (
            <span>C {formatGrams(food.nutrients.carbs, language)} g</span>
          ) : null}
          {food.nutrients.fat !== null ? (
            <span>F {formatGrams(food.nutrients.fat, language)} g</span>
          ) : null}
        </span>
      </div>
      <div className="food-actions">
        <button
          type="button"
          className="button small secondary"
          onClick={onQuickAdd}
        >
          <Icon name="plus" size={15} />
          {t("foods.quickAdd")}
        </button>
        <button
          type="button"
          className="icon-button small"
          onClick={onFavorite}
          disabled={favoritePending}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? t("foods.unfavorite") : t("foods.favoriteAdd")}
          title={isFavorite ? t("foods.unfavorite") : t("foods.favoriteAdd")}
        >
          <Icon name={isFavorite ? "star-filled" : "star"} size={16} />
        </button>
        {onEdit ? (
          <button
            type="button"
            className="icon-button small"
            onClick={onEdit}
            aria-label={t("foods.edit")}
            title={t("foods.edit")}
          >
            <Icon name="pencil" size={15} />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className="icon-button small danger"
            onClick={onDelete}
            aria-label={t("foods.deleteFood")}
            title={t("foods.deleteFood")}
          >
            <Icon name="trash" size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CustomFoodDialog({
  food,
  language,
  onClose,
  onDone,
}: {
  food?: Food;
  language: Language;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const action = food ? updateCustomFoodAction : createCustomFoodAction;
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [basis, setBasis] = useState(food?.basisType ?? "100g");

  useEffect(() => {
    if (state.status === "success" && state.message) {
      onDone(translate(language, state.message as TranslationKey));
    }
  }, [state, language, onDone]);

  const generalError =
    state.status === "error" && state.message
      ? translate(language, state.message as TranslationKey)
      : null;
  const errorFor = (field: string) =>
    state.fieldErrors?.[field]
      ? translate(language, state.fieldErrors[field] as TranslationKey)
      : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={food ? t("foods.editCustomFood") : t("foods.newCustomFood")}
      description={t("foods.customHint")}
      language={language}
      size="medium"
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="custom-food-form"
            className="button"
            disabled={pending}
          >
            {pending ? t("common.saving") : t("common.save")}
          </button>
        </>
      }
    >
      <form id="custom-food-form" action={formAction} className="stack">
        {food ? <input type="hidden" name="foodId" value={food.id} /> : null}
        {generalError ? (
          <p className="notice error" role="alert">
            {generalError}
          </p>
        ) : null}
        <p className="source-note">{t("sources.customNote")}</p>
        <FoodPhotoField
          language={language}
          name={food?.name ?? "?"}
          initialUrl={food?.imageUrl}
        />
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="food-name">{t("foods.name")}</label>
            <input
              id="food-name"
              name="name"
              className="input"
              defaultValue={food?.name ?? ""}
              required
              aria-invalid={errorFor("name") ? true : undefined}
              data-autofocus
            />
            {errorFor("name") ? (
              <p className="field-error">{errorFor("name")}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="food-brand">
              {t("foods.brand")} <span className="subtle">({t("common.optional")})</span>
            </label>
            <input
              id="food-brand"
              name="brand"
              className="input"
              defaultValue={food?.brand ?? ""}
            />
            {errorFor("brand") ? (
              <p className="field-error">{errorFor("brand")}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="food-barcode">
              {t("foods.barcode")}{" "}
              <span className="subtle">({t("common.optional")})</span>
            </label>
            <input
              id="food-barcode"
              name="barcode"
              className="input"
              inputMode="numeric"
              defaultValue={food?.barcode ?? ""}
              aria-describedby="food-barcode-hint"
            />
            <p className="field-hint" id="food-barcode-hint">
              {t("search.barcodeHelp")}
            </p>
            {errorFor("barcode") ? (
              <p className="field-error">{errorFor("barcode")}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="food-basis">{t("foods.basis")}</label>
            <select
              id="food-basis"
              name="basisType"
              className="select"
              value={basis}
              onChange={(event) =>
                setBasis(event.target.value as typeof basis)
              }
            >
              <option value="100g">{t("foods.basis100g")}</option>
              <option value="100ml">{t("foods.basis100ml")}</option>
              <option value="serving">{t("foods.basisServing")}</option>
            </select>
            <p className="field-hint">{t("foods.basisHelp")}</p>
          </div>
          {basis === "serving" ? (
            <>
              <div className="field">
                <label htmlFor="food-serving-size">
                  {t("foods.servingSize")}
                </label>
                <input
                  id="food-serving-size"
                  name="servingSize"
                  className="input"
                  inputMode="decimal"
                  defaultValue={food?.servingSize ?? ""}
                  aria-invalid={errorFor("servingSize") ? true : undefined}
                />
                {errorFor("servingSize") ? (
                  <p className="field-error">{errorFor("servingSize")}</p>
                ) : null}
              </div>
              <div className="field">
                <label htmlFor="food-serving-unit">
                  {t("foods.servingUnit")}
                </label>
                <select
                  id="food-serving-unit"
                  name="servingUnit"
                  className="select"
                  defaultValue={food?.servingUnit ?? "g"}
                >
                  <option value="g">{t("units.g")}</option>
                  <option value="ml">{t("units.ml")}</option>
                </select>
              </div>
            </>
          ) : (
            <input type="hidden" name="servingSize" value="" />
          )}
        </div>

        <div className="form-section">
          <div>
            <h3 className="form-section-title">{t("foods.nutrientsSection")}</h3>
            <p className="field-hint">{t("foods.nutrientsHint")}</p>
          </div>
          <div className="form-grid">
            {NUTRIENT_KEYS.map((key) => (
              <div className="field" key={key}>
                <label htmlFor={`nutrient-${key}`}>
                  {t(nutrientLabelKey(key) as TranslationKey)} ({nutrientUnit(key)})
                </label>
                <input
                  id={`nutrient-${key}`}
                  name={key}
                  className="input"
                  inputMode="decimal"
                  defaultValue={food?.nutrients[key] ?? ""}
                  placeholder={t("common.unknown")}
                  aria-invalid={errorFor(`nutrients.${key}`) ? true : undefined}
                />
                {errorFor(`nutrients.${key}`) ? (
                  <p className="field-error">
                    {errorFor(`nutrients.${key}`)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="source-note">{t("foods.nutrientsHint")}</p>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteFoodDialog({
  food,
  language,
  onClose,
  onDone,
}: {
  food: Food;
  language: Language;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteFoodAction(food.id ?? "");
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(t("foods.deleted"));
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("foods.deleteTitle")}
      description={t("foods.deleteFoodConfirm", { name: food.name })}
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
            {pending ? t("common.saving") : t("foods.deleteFood")}
          </button>
        </>
      }
    >
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : (
        <p className="source-note">{t("sources.customNote")}</p>
      )}
    </Dialog>
  );
}

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

function SavedMealBuilderDialog({
  savedMeal,
  availableFoods,
  language,
  unitSystem,
  onClose,
  onDone,
}: {
  savedMeal: SavedMeal | null;
  availableFoods: Food[];
  language: Language;
  unitSystem: UnitSystem;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const foods = useMemo(() => {
    const map = new Map<string, Food>();
    for (const food of availableFoods) {
      if (food.id) map.set(food.id, food);
    }
    for (const item of savedMeal?.items ?? []) {
      if (item.food.id) map.set(item.food.id, item.food);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [availableFoods, savedMeal]);

  const [name, setName] = useState(savedMeal?.name ?? "");
  const [rows, setRows] = useState<BuilderRow[]>(() =>
    (savedMeal?.items ?? []).map((item) => ({
      key: item.id,
      foodId: item.food.id ?? "",
      amount: formatNumber(
        fromBaseAmount(item.amount, item.amountUnit, unitSystem).value,
        language,
        2,
      ),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addRow() {
    const used = new Set(rows.map((row) => row.foodId));
    const nextFood = foods.find((food) => food.id && !used.has(food.id));
    const nextId = nextFood?.id;
    if (!nextFood || !nextId) return;
    setRows((current) => [
      ...current,
      {
        key: `row-${Date.now()}-${current.length}`,
        foodId: nextId,
        amount: defaultDisplayAmount(nextFood, unitSystem),
      },
    ]);
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
    const items: { foodId: string; amount: number; amountUnit: AmountUnit }[] = [];
    for (const row of rows) {
      const food = foods.find((candidate) => candidate.id === row.foodId);
      const parsed = Number(row.amount.replace(",", "."));
      if (!food || !Number.isFinite(parsed) || parsed <= 0) {
        setError(t("savedMeals.amountInvalid"));
        return;
      }
      const unit = displayUnitFor(food, unitSystem);
      try {
        const base = toBaseAmount(
          parsed,
          unit as "g" | "ml" | "oz" | "floz" | "serving",
        );
        items.push({ foodId: food.id ?? "", ...base });
      } catch {
        setError(t("savedMeals.amountInvalid"));
        return;
      }
    }
    startTransition(async () => {
      const result = await saveMealAction({
        savedMealId: savedMeal?.id,
        name: name.trim(),
        items,
      });
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(
        t(
          savedMeal
            ? "savedMeals.updated"
            : "savedMeals.created",
        ),
      );
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={savedMeal ? t("savedMeals.edit") : t("savedMeals.new")}
      description={t("savedMeals.builderHelp")}
      language={language}
      size="medium"
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
      {foods.length === 0 ? (
        <EmptyState icon="book" title={t("savedMeals.noAvailable")}>
          {t("foods.emptyCustomHelp")}
        </EmptyState>
      ) : (
        <div className="stack">
          <div className="field">
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

          <div className="stack-sm">
            <span className="field-label">{t("savedMeals.items")}</span>
            {rows.map((row) => {
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
            })}
            <button
              type="button"
              className="button secondary small"
              onClick={addRow}
              disabled={rows.length >= foods.length}
            >
              <Icon name="plus" size={16} />
              {t("savedMeals.addItem")}
            </button>
          </div>

          {error ? (
            <p className="notice error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function DeleteSavedMealDialog({
  meal,
  language,
  onClose,
  onDone,
}: {
  meal: SavedMeal;
  language: Language;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteSavedMealAction(meal.id);
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
      description={t("savedMeals.deleteConfirm", { name: meal.name })}
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
