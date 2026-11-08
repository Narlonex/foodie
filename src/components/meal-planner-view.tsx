"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addPantryItemAction,
  addPlanItemAction,
  addShoppingItemAction,
  clearCheckedShoppingAction,
  deletePantryItemAction,
  deletePlanItemAction,
  deleteShoppingItemAction,
  generateShoppingListAction,
  logPlannedMealAction,
  toggleShoppingItemAction,
} from "@/actions/mealPlanner";
import {
  getTranslator,
  translate,
  type TranslationKey,
  type Translator,
} from "@/i18n";
import {
  addDays,
  formatShortDate,
  formatWeekRange,
  startOfWeek,
  weekDates,
} from "@/lib/dates";
import { formatKcal, formatNumber, formatPortion } from "@/lib/format";
import { planNutrients } from "@/lib/mealPlanning";
import { recipeNutrition } from "@/lib/recipes";
import {
  MEALS,
  type Language,
  type Meal,
  type PantryItem,
  type PantryUnit,
  type PlanItem,
  type SavedMeal,
  type ShoppingItem,
  type ShoppingUnit,
  type UnitSystem,
} from "@/lib/types";
import { Dialog } from "./dialog";
import { Icon } from "./icons";

type Tab = "planner" | "shopping" | "pantry";
type PlannableRecipe = { recipe: SavedMeal; unit: "g" | "serving" };

function unitLabel(unit: ShoppingUnit | PantryUnit, t: Translator): string {
  if (unit === "pcs") return t("plan.unit.pcs");
  if (unit === "serving") return t("units.serving");
  return unit === "ml" ? t("units.ml") : t("units.g");
}

function amountText(
  amount: number | null,
  unit: ShoppingUnit | PantryUnit,
  language: Language,
  t: Translator,
): string {
  if (amount === null) return "—";
  const label =
    unit === "serving" && amount !== 1 ? t("units.servings") : unitLabel(unit, t);
  return `${formatNumber(amount, language, 2)} ${label}`;
}

function expiryState(
  expiresOn: string | null,
  today: string,
): "expired" | "soon" | "later" | null {
  if (!expiresOn) return null;
  const days = Math.round(
    (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  if (days < 0) return "expired";
  if (days <= 7) return "soon";
  return "later";
}

export function MealPlannerView({
  weekStart,
  today,
  items,
  recipes,
  shopping,
  pantry,
  householdName = null,
  language,
  unitSystem,
}: {
  weekStart: string;
  today: string;
  items: PlanItem[];
  recipes: SavedMeal[];
  shopping: ShoppingItem[];
  pantry: PantryItem[];
  householdName?: string | null;
  language: Language;
  unitSystem: UnitSystem;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const dates = weekDates(weekStart);
  const [tab, setTab] = useState<Tab>("planner");
  const [addTarget, setAddTarget] = useState<{
    date: string;
    meal: Meal;
  } | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [amount, setAmount] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [shoppingName, setShoppingName] = useState("");
  const [shoppingQuantity, setShoppingQuantity] = useState("1");
  const [shoppingUnit, setShoppingUnit] = useState<ShoppingUnit>("pcs");
  const [pantryName, setPantryName] = useState("");
  const [pantryQuantity, setPantryQuantity] = useState("1");
  const [pantryUnit, setPantryUnit] = useState<PantryUnit>("g");
  const [pantryExpiry, setPantryExpiry] = useState("");

  const plannable = useMemo<PlannableRecipe[]>(() => {
    const result: PlannableRecipe[] = [];
    for (const recipe of recipes) {
      const summary = recipeNutrition(
        recipe.items.map((item) => ({
          food: item.food,
          amount: item.amount,
          amountUnit: item.amountUnit,
        })),
        recipe.finalWeightG,
        recipe.servings,
      );
      if (summary.per100g) result.push({ recipe, unit: "g" });
      else if (summary.perServing) result.push({ recipe, unit: "serving" });
    }
    return result;
  }, [recipes]);

  const selected = plannable.find(
    (entry) => entry.recipe.id === selectedRecipeId,
  );
  const grouped = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const item of items) {
      const key = `${item.date}|${item.meal}`;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showError(key: string) {
    setError(translate(language, key as TranslationKey));
  }

  function goWeek(next: string) {
    router.push(`/plan?week=${next}`);
  }

  function openAdd(date: string, meal: Meal) {
    setAddTarget({ date, meal });
    setError(null);
    const first = plannable[0];
    if (first) {
      setSelectedRecipeId(first.recipe.id);
      setAmount(first.unit === "g" ? "100" : "1");
    } else {
      setSelectedRecipeId("");
      setAmount("");
    }
  }

  function pickRecipe(id: string) {
    setSelectedRecipeId(id);
    const found = plannable.find((entry) => entry.recipe.id === id);
    if (found) setAmount(found.unit === "g" ? "100" : "1");
  }

  function addPlanned() {
    if (!addTarget || !selectedRecipeId) return;
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      showError("plan.amountInvalid");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addPlanItemAction({
        date: addTarget.date,
        meal: addTarget.meal,
        savedMealId: selectedRecipeId,
        amount: parsed,
      });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setAddTarget(null);
      setToast(t("plan.added"));
      router.refresh();
    });
  }

  function removeItem(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deletePlanItemAction(id);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setToast(t("plan.removed"));
      router.refresh();
    });
  }

  function logMeal(date: string, meal: Meal) {
    setError(null);
    startTransition(async () => {
      const result = await logPlannedMealAction({ date, meal });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setToast(
        t("plan.loggedCount", { count: result.data?.count ?? 0 }),
      );
      router.refresh();
    });
  }

  function generateList() {
    setError(null);
    startTransition(async () => {
      const result = await generateShoppingListAction({
        from: dates[0]!,
        to: dates[6]!,
      });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setToast(
        result.data?.count
          ? t("plan.shopping.generated", { count: result.data.count })
          : t("plan.shopping.generatedEmpty"),
      );
      router.refresh();
    });
  }

  function addShopping(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(shoppingQuantity.replace(",", "."));
    if (!shoppingName.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      showError("plan.shopping.error");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addShoppingItemAction({
        name: shoppingName,
        quantity,
        unit: shoppingUnit,
      });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setShoppingName("");
      setShoppingQuantity("1");
      setToast(t("plan.shopping.added"));
      router.refresh();
    });
  }

  function toggleShopping(id: string, checked: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await toggleShoppingItemAction(id, checked);
      if (!result.ok) showError(result.error);
      else router.refresh();
    });
  }

  function removeShopping(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteShoppingItemAction(id);
      if (!result.ok) showError(result.error);
      else {
        setToast(t("plan.shopping.removed"));
        router.refresh();
      }
    });
  }

  function clearChecked() {
    setError(null);
    startTransition(async () => {
      const result = await clearCheckedShoppingAction();
      if (!result.ok) showError(result.error);
      else {
        setToast(t("plan.shopping.cleared"));
        router.refresh();
      }
    });
  }

  function addPantry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(pantryQuantity.replace(",", "."));
    if (!pantryName.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      showError("plan.pantry.error");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addPantryItemAction({
        name: pantryName,
        quantity,
        unit: pantryUnit,
        expiresOn: pantryExpiry || null,
      });
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setPantryName("");
      setPantryQuantity("1");
      setPantryExpiry("");
      setToast(t("plan.pantry.added"));
      router.refresh();
    });
  }

  function removePantry(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deletePantryItemAction(id);
      if (!result.ok) showError(result.error);
      else {
        setToast(t("plan.pantry.removed"));
        router.refresh();
      }
    });
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("plan.eyebrow")}</p>
          <h1>{t("plan.title")}</h1>
          <p className="page-subtitle">{t("plan.subtitle")}</p>
          {householdName ? (
            <p className="source-note">
              {t("plan.householdNote", { name: householdName })}
            </p>
          ) : null}
        </div>
        <div className="plan-weeknav">
          <button
            type="button"
            className="icon-button"
            aria-label={t("plan.prevWeek")}
            onClick={() => goWeek(addDays(weekStart, -7))}
          >
            <Icon name="chevron-left" size={18} />
          </button>
          <Link
            href={`/plan?week=${startOfWeek(today)}`}
            className="button secondary"
          >
            {t("plan.thisWeek")}
          </Link>
          <button
            type="button"
            className="icon-button"
            aria-label={t("plan.nextWeek")}
            onClick={() => goWeek(addDays(weekStart, 7))}
          >
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </div>

      <div className="row-between plan-toolbar">
        <div className="segmented" role="tablist" aria-label={t("plan.title")}>
          {(
            [
              ["planner", "plan.tabPlanner"],
              ["shopping", "plan.tabShopping"],
              ["pantry", "plan.tabPantry"],
            ] as [Tab, TranslationKey][]
          ).map(([value, key]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                setTab(value);
                setError(null);
              }}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <span className="badge">
          {formatWeekRange(weekStart, language)}
        </span>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "planner" ? (
        <div className="plan-grid">
          {dates.map((date) => (
            <section
              className={`card plan-day${date === today ? " is-today" : ""}`}
              key={date}
            >
              <div className="plan-day-head">
                <h2>{formatShortDate(date, language)}</h2>
                {date === today ? (
                  <span className="badge">{t("plan.today")}</span>
                ) : null}
              </div>
              {MEALS.map((meal) => {
                const mealItems = grouped.get(`${date}|${meal}`) ?? [];
                const known = mealItems
                  .map((item) => planNutrients(item).kcal)
                  .filter((value): value is number => value !== null);
                const total = known.reduce((sum, value) => sum + value, 0);
                const unlogged = mealItems.filter((item) => !item.loggedAt).length;
                return (
                  <div className="plan-meal" key={meal}>
                    <div className="plan-meal-head">
                      <h3>{t(`meals.${meal}` as TranslationKey)}</h3>
                      <button
                        type="button"
                        className="icon-button small ghost"
                        aria-label={`${t("plan.add")} – ${t(
                          `meals.${meal}` as TranslationKey,
                        )} ${formatShortDate(date, language)}`}
                        onClick={() => openAdd(date, meal)}
                      >
                        <Icon name="plus" size={15} />
                      </button>
                    </div>
                    {mealItems.length === 0 ? (
                      <p className="plan-meal-empty">{t("plan.mealEmpty")}</p>
                    ) : (
                      <div className="plan-item-list">
                        {mealItems.map((item) => {
                          const nutrients = planNutrients(item);
                          return (
                            <div className="plan-item" key={item.id}>
                              <div className="plan-item-copy">
                                <strong>{item.name}</strong>
                                <span>
                                  {formatPortion(
                                    item.amount,
                                    item.amountUnit,
                                    unitSystem,
                                    language,
                                    t,
                                  )}
                                  {nutrients.kcal !== null
                                    ? ` · ${formatKcal(nutrients.kcal, language)} kcal`
                                    : ""}
                                </span>
                              </div>
                              {item.loggedAt ? (
                                <span className="badge plan-logged">
                                  {t("plan.logged")}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="icon-button small ghost"
                                  aria-label={t("plan.remove")}
                                  disabled={pending}
                                  onClick={() => removeItem(item.id)}
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {mealItems.length > 0 ? (
                      <div className="plan-meal-foot">
                        <span>
                          {known.length > 0
                            ? `${formatKcal(total, language)} kcal`
                            : "—"}
                        </span>
                        {unlogged > 0 ? (
                          <button
                            type="button"
                            className="plan-log-button"
                            disabled={pending}
                            onClick={() => logMeal(date, meal)}
                          >
                            {t("plan.logMeal")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      ) : null}

      {tab === "shopping" ? (
        <section className="card card-pad stack">
          <div className="row-between">
            <div>
              <h2 className="card-title">{t("plan.shopping.title")}</h2>
              <p className="field-hint">{t("plan.shopping.help")}</p>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={generateList}
            >
              <Icon name="repeat" size={16} />
              {t("plan.shopping.generate")}
            </button>
          </div>
          <p className="field-hint">{t("plan.shopping.pantryNote")}</p>
          {shopping.length === 0 ? (
            <p className="empty-state">{t("plan.shopping.empty")}</p>
          ) : (
            <div className="shopping-list">
              {shopping.map((item) => (
                <div
                  className={`shopping-row${item.checked ? " is-done" : ""}`}
                  key={item.id}
                >
                  <label className="shopping-check">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) =>
                        toggleShopping(item.id, event.target.checked)
                      }
                    />
                    <span>{item.name}</span>
                  </label>
                  <span className="shopping-qty">
                    {amountText(item.quantity, item.unit, language, t)}
                  </span>
                  {item.source === "plan" ? (
                    <span className="badge">{t("plan.shopping.fromPlan")}</span>
                  ) : null}
                  <button
                    type="button"
                    className="icon-button small ghost"
                    aria-label={t("plan.remove")}
                    disabled={pending}
                    onClick={() => removeShopping(item.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="row-between plan-list-actions">
            <button
              type="button"
              className="button ghost"
              disabled={pending || !shopping.some((item) => item.checked)}
              onClick={clearChecked}
            >
              {t("plan.shopping.clearChecked")}
            </button>
          </div>
          <form className="planner-form" onSubmit={addShopping}>
            <h3 className="form-section-title">{t("plan.shopping.manual")}</h3>
            <label className="field">
              <span className="field-label">{t("plan.shopping.name")}</span>
              <input
                className="input"
                value={shoppingName}
                maxLength={200}
                onChange={(event) => setShoppingName(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">{t("plan.shopping.quantity")}</span>
              <input
                className="input"
                type="number"
                min="0.001"
                step="0.001"
                value={shoppingQuantity}
                onChange={(event) => setShoppingQuantity(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">{t("plan.shopping.unit")}</span>
              <select
                className="select"
                value={shoppingUnit}
                onChange={(event) =>
                  setShoppingUnit(event.target.value as ShoppingUnit)
                }
              >
                <option value="g">{t("units.g")}</option>
                <option value="ml">{t("units.ml")}</option>
                <option value="pcs">{t("plan.unit.pcs")}</option>
                <option value="serving">{t("units.serving")}</option>
              </select>
            </label>
            <button className="button" type="submit" disabled={pending}>
              <Icon name="plus" size={16} />
              {t("plan.shopping.add")}
            </button>
          </form>
        </section>
      ) : null}

      {tab === "pantry" ? (
        <section className="card card-pad stack">
          <div>
            <h2 className="card-title">{t("plan.pantry.title")}</h2>
            <p className="field-hint">{t("plan.pantry.help")}</p>
          </div>
          {pantry.length === 0 ? (
            <p className="empty-state">{t("plan.pantry.empty")}</p>
          ) : (
            <div className="pantry-list">
              {pantry.map((item) => {
                const expiry = expiryState(item.expiresOn, today);
                return (
                  <div className="pantry-row" key={item.id}>
                    <div className="plan-item-copy">
                      <strong>{item.name}</strong>
                      <span>
                        {amountText(item.quantity, item.unit, language, t)}
                        {item.expiresOn
                          ? ` · ${formatShortDate(item.expiresOn, language)}`
                          : ""}
                      </span>
                    </div>
                    {expiry === "expired" ? (
                      <span className="expiry-badge expired">
                        {t("plan.pantry.expired")}
                      </span>
                    ) : expiry === "soon" ? (
                      <span className="expiry-badge soon">
                        {t("plan.pantry.expiringSoon")}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="icon-button small ghost"
                      aria-label={t("plan.remove")}
                      disabled={pending}
                      onClick={() => removePantry(item.id)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <form className="planner-form" onSubmit={addPantry}>
            <h3 className="form-section-title">{t("plan.pantry.add")}</h3>
            <label className="field">
              <span className="field-label">{t("plan.pantry.name")}</span>
              <input
                className="input"
                value={pantryName}
                maxLength={200}
                onChange={(event) => setPantryName(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">{t("plan.pantry.quantity")}</span>
              <input
                className="input"
                type="number"
                min="0.001"
                step="0.001"
                value={pantryQuantity}
                onChange={(event) => setPantryQuantity(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">{t("plan.pantry.unit")}</span>
              <select
                className="select"
                value={pantryUnit}
                onChange={(event) =>
                  setPantryUnit(event.target.value as PantryUnit)
                }
              >
                <option value="g">{t("units.g")}</option>
                <option value="ml">{t("units.ml")}</option>
                <option value="pcs">{t("plan.unit.pcs")}</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t("plan.pantry.expiry")}</span>
              <input
                className="input"
                type="date"
                value={pantryExpiry}
                onChange={(event) => setPantryExpiry(event.target.value)}
              />
            </label>
            <button className="button" type="submit" disabled={pending}>
              <Icon name="plus" size={16} />
              {t("plan.pantry.add")}
            </button>
          </form>
        </section>
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}

      <Dialog
        open={Boolean(addTarget)}
        onClose={() => setAddTarget(null)}
        title={t("plan.addTitle")}
        description={t("plan.addDescription")}
        language={language}
        footer={
          <>
            <button
              type="button"
              className="button ghost"
              onClick={() => setAddTarget(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="button"
              disabled={pending || !selectedRecipeId}
              onClick={addPlanned}
            >
              <Icon name="plus" size={16} />
              {t("plan.add")}
            </button>
          </>
        }
      >
        {plannable.length === 0 ? (
          <div className="stack">
            <p>{t("plan.noRecipes")}</p>
            <Link href="/recipes" className="button secondary">
              {t("plan.noRecipesHelp")}
            </Link>
          </div>
        ) : (
          <div className="stack">
            <label className="field">
              <span className="field-label">{t("plan.recipe")}</span>
              <select
                className="select"
                value={selectedRecipeId}
                onChange={(event) => pickRecipe(event.target.value)}
              >
                {plannable.map((entry) => (
                  <option key={entry.recipe.id} value={entry.recipe.id}>
                    {entry.recipe.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">
                {t("plan.amount")} ({selected?.unit === "serving"
                  ? t("units.servings")
                  : t("units.g")})
              </span>
              <input
                className="input"
                type="number"
                min="0.001"
                step="0.001"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            {addTarget ? (
              <p className="field-hint">
                {formatShortDate(addTarget.date, language)} ·{" "}
                {t(`meals.${addTarget.meal}` as TranslationKey)}
              </p>
            ) : null}
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </Dialog>
    </div>
  );
}
