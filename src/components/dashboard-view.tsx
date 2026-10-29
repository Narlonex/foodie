"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDayTypeForDateAction } from "@/actions/dayTypes";
import { getTranslator, type TranslationKey, type Translator } from "@/i18n";
import {
  addDays,
  formatLongDate,
  startOfWeek,
  weekDates,
} from "@/lib/dates";
import {
  formatGrams,
  formatKcal,
  formatNumber,
  formatPortion,
  formatSalt,
} from "@/lib/format";
import { entryPortion, totalNutrients } from "@/lib/nutrition";
import {
  MEALS,
  NUTRIENT_KEYS,
  type DashboardNutrient,
  type DayType,
  type DiaryEntry,
  type DiaryTotals,
  type Food,
  type Language,
  type Meal,
  type SavedMeal,
  type UnitSystem,
} from "@/lib/types";
import { AddFoodDialog } from "./add-food-dialog";
import { AddSavedMealDialog } from "./add-saved-meal-dialog";
import { CopyDayDialog, RepeatMealDialog } from "./copy-day-dialog";
import {
  DeleteEntryDialog,
  EditEntryDialog,
  MoveEntryDialog,
} from "./entry-dialogs";
import { FoodThumb } from "./food-thumb";
import { Icon } from "./icons";
import {
  EmptyState,
  MealIcon,
  PreparationBadge,
  ProgressBar,
  SourceBadge,
} from "./ui";

const MACRO_CARDS = [
  { key: "protein", label: "nutrients.protein" },
  { key: "carbs", label: "nutrients.carbs" },
  { key: "fat", label: "nutrients.fat" },
] as const satisfies readonly {
  key: "protein" | "carbs" | "fat";
  label: TranslationKey;
}[];

export function DashboardView({
  date,
  today,
  language,
  unitSystem,
  assignedDayTypeId,
  dayTypes,
  defaultDayTypeId,
  entries,
  totals,
  dashboardNutrients,
  favorites,
  recent,
  customFoods,
  savedMeals,
  usdaEnabled,
}: {
  date: string;
  today: string;
  language: Language;
  unitSystem: UnitSystem;
  assignedDayTypeId: string | null;
  dayTypes: DayType[];
  defaultDayTypeId: string | null;
  entries: DiaryEntry[];
  totals: DiaryTotals;
  favorites: Food[];
  recent: Food[];
  customFoods: Food[];
  savedMeals: SavedMeal[];
  usdaEnabled: boolean;
  dashboardNutrients: DashboardNutrient[];
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [addMeal, setAddMeal] = useState<Meal | null>(null);
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null);
  const [movingEntry, setMovingEntry] = useState<DiaryEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<DiaryEntry | null>(null);
  const [repeatMeal, setRepeatMeal] = useState<Meal | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [savedMealOpen, setSavedMealOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedDayTypeId, setSelectedDayTypeId] = useState(
    assignedDayTypeId ?? "default",
  );
  const [switchingDayType, startDayTypeSwitch] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentDayType =
    selectedDayTypeId === "default"
      ? (dayTypes.find((type) => type.id === defaultDayTypeId) ?? null)
      : (dayTypes.find((type) => type.id === selectedDayTypeId) ?? null);

  function changeDayType(next: string) {
    if (next === selectedDayTypeId) return;
    const previous = selectedDayTypeId;
    setSelectedDayTypeId(next);
    startDayTypeSwitch(async () => {
      const result = await setDayTypeForDateAction(date, next);
      if (!result.ok) {
        setSelectedDayTypeId(previous);
        setToast(t("common.error"));
        return;
      }
      router.refresh();
    });
  }

  const byMeal = useMemo(() => {
    const map = new Map<Meal, DiaryEntry[]>();
    for (const meal of MEALS) map.set(meal, []);
    for (const entry of entries) map.get(entry.meal)?.push(entry);
    return map;
  }, [entries]);

  // A day with no entries is a known zero logged intake, not an unknown
  // nutrient value. Source-level gaps still stay null through totalNutrients.
  const displayNutrients =
    entries.length === 0
      ? (Object.fromEntries(
          NUTRIENT_KEYS.map((key) => [
            key,
            { value: 0, knownEntries: 0, missingEntries: 0 },
          ]),
        ) as DiaryTotals["nutrients"])
      : totals.nutrients;
  const visibleMacros = MACRO_CARDS.filter((macro) =>
    dashboardNutrients.includes(macro.key),
  );
  const consumed = displayNutrients.kcal.value;
  const target = currentDayType?.kcal ?? null;
  const remaining =
    target !== null && consumed !== null ? target - consumed : null;
  const over = remaining !== null && remaining < 0;
  const percent =
    target !== null && target > 0 && consumed !== null
      ? Math.min(100, Math.max(0, (consumed / target) * 100))
      : 0;
  const ringCircumference = 2 * Math.PI * 70;

  function finish(message: string) {
    setAddMeal(null);
    setEditingEntry(null);
    setMovingEntry(null);
    setDeletingEntry(null);
    setRepeatMeal(null);
    setCopyOpen(false);
    setSavedMealOpen(false);
    setToast(message);
    router.refresh();
  }

  return (
    <>
      <div className="page-header dashboard-hero">
        <div>
          <p className="eyebrow">{t("nav.dashboard")}</p>
          <h1>{t("dashboard.today")}</h1>
          <p className="page-subtitle">
            {formatLongDate(date, language)}
            {currentDayType
              ? ` · ${t(
                  selectedDayTypeId === "default"
                    ? "dashboard.dayTypeDefault"
                    : "dashboard.dayTypeAssigned",
                  { name: currentDayType.name },
                )}`
              : ""}
          </p>
        </div>
        <div className="date-nav">
          <label className="sr-only" htmlFor="dashboard-date">
            {t("dashboard.pickDate")}
          </label>
          <input
            id="dashboard-date"
            type="date"
            className="date-input"
            value={date}
            onChange={(event) => {
              if (event.target.value) {
                router.push(`/?date=${event.target.value}`);
              }
            }}
          />
          <button
            type="button"
            className="button secondary small"
            onClick={() => router.push(`/?date=${today}`)}
            disabled={date === today}
          >
            {t("dashboard.today")}
          </button>
        </div>
      </div>

      <WeekStrip
        date={date}
        today={today}
        language={language}
        onChange={(next) => router.push(`/?date=${next}`)}
      />

      <div className="dashboard-grid">
        <div className="stack">
          <section className="card calorie-card" aria-labelledby="calorie-summary">
            <div
              className={`calorie-ring ${over ? "over" : ""}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={target ?? undefined}
              aria-valuenow={
                target !== null && consumed !== null
                  ? Math.min(consumed, target)
                  : undefined
              }
              aria-valuetext={
                target !== null && consumed !== null
                  ? t("a11y.calorieProgress", {
                      consumed: formatKcal(consumed, language),
                      target: formatKcal(target, language),
                    })
                  : `${formatKcal(consumed, language)} kcal`
              }
              aria-label={
                target !== null
                  ? t("a11y.calorieProgress", {
                      consumed: formatKcal(consumed, language),
                      target: formatKcal(target, language),
                    })
                  : t("nutrients.kcal")
              }
            >
              <svg viewBox="0 0 176 176" aria-hidden="true">
                <circle
                  className="ring-track"
                  cx="88"
                  cy="88"
                  r="70"
                  fill="none"
                  strokeWidth="11"
                />
                <circle
                  className="ring-value"
                  cx="88"
                  cy="88"
                  r="70"
                  fill="none"
                  strokeWidth="11"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={
                    ringCircumference * (1 - percent / 100)
                  }
                />
              </svg>
              <div className="ring-center">
                <span className="ring-number">
                  {remaining !== null
                    ? formatNumber(Math.abs(remaining), language, 0)
                    : consumed !== null
                      ? formatKcal(consumed, language)
                      : "—"}
                </span>
                <span className="ring-label">
                  {remaining !== null
                    ? over
                      ? t("dashboard.exceeded")
                      : t("dashboard.caloriesRemaining")
                    : target === null
                      ? t("dashboard.caloriesLogged")
                      : t("common.unknown")}
                </span>
              </div>
            </div>

            <div className="calorie-summary">
              <div className="row-between">
                <div>
                  <h2 id="calorie-summary" className="card-title">
                    {t("dashboard.dailyTotals")}
                  </h2>
                  <p className="card-hint">
                    {currentDayType
                      ? t("dashboard.ofTarget", {
                          target: formatKcal(target, language),
                        })
                      : t("dashboard.noTarget")}
                  </p>
                </div>
                {currentDayType ? (
                  <span className="badge accent">{currentDayType.name}</span>
                ) : null}
              </div>
              <div className="summary-stats">
                <div className="summary-stat">
                  <strong>{formatKcal(consumed, language)}</strong>
                  <span>{t("dashboard.consumed")} · kcal</span>
                </div>
                <div className="summary-stat">
                  <strong>{formatKcal(target, language)}</strong>
                  <span>{t("dashboard.target")} · kcal</span>
                </div>
                <div className="summary-stat">
                  <strong>{formatNumber(entries.length, language, 0)}</strong>
                  <span>{t("history.entries")}</span>
                </div>
              </div>
              <div className="macro-grid">
                {visibleMacros.map((macro) => (
                  <MacroCard
                    key={macro.key}
                    name={t(macro.label)}
                    color={macro.key}
                    consumed={displayNutrients[macro.key]}
                    target={currentDayType?.[macro.key] ?? null}
                    language={language}
                    t={t}
                  />
                ))}
              </div>
              <div className="row-between">
                <Link href="/settings/dashboard" className="button-link small">
                  {t("dashboard.editVisibleNutrients")}
                </Link>
                <span className="small muted">{t("dashboard.macrosHelp")}</span>
              </div>
              {remaining !== null && over ? (
                <p className="badge danger" style={{ justifySelf: "start" }}>
                  {t("dashboard.overBy", {
                    value: formatNumber(Math.abs(remaining), language, 0),
                  })}
                </p>
              ) : null}
              {totals.unknownEnergyEntries > 0 ? (
                <p className="notice warning">
                  <Icon name="alert" size={17} />
                  <span>{t("dashboard.partialEnergy")}</span>
                </p>
              ) : null}
              {totals.calculatedEnergyEntries > 0 &&
              totals.unknownEnergyEntries === 0 ? (
                <p className="source-note">
                  {t("dashboard.calculatedEnergy")}
                </p>
              ) : null}
            </div>
          </section>

          {entries.length === 0 ? (
            <section className="dashboard-empty" aria-label={t("dashboard.noEntriesToday")}>
              <span className="dashboard-empty-icon">
                <Icon name="bowl" size={22} />
              </span>
              <div className="dashboard-empty-copy">
                <strong>{t("dashboard.noEntriesToday")}</strong>
                <p>{t("dashboard.noEntriesHelp")}</p>
              </div>
              <div className="dashboard-empty-actions">
                <button
                  type="button"
                  className="button small"
                  onClick={() => setAddMeal("breakfast")}
                >
                  <Icon name="plus" size={16} />
                  {t("dashboard.addFood")}
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => setCopyOpen(true)}
                >
                  <Icon name="copy" size={16} />
                  {t("dashboard.copyDay")}
                </button>
              </div>
            </section>
          ) : null}

          <div className="meals-head">
            <h2>
              {t("dashboard.mealsTitle")}
              <span className="meals-count">
                {entries.length === 1
                  ? t("dashboard.entryCountOne")
                  : t("dashboard.entryCount", { count: entries.length })}
              </span>
            </h2>
            <button
              type="button"
              className="button small"
              onClick={() => setAddMeal("breakfast")}
            >
              <Icon name="plus" size={15} />
              {t("dashboard.addFood")}
            </button>
          </div>

          <section className="meals-section" aria-label={t("dashboard.mealsTitle")}>
            {MEALS.map((meal) => {
              const mealEntries = byMeal.get(meal) ?? [];
              return (
                <MealSection
                  key={meal}
                  meal={meal}
                  entries={mealEntries}
                  language={language}
                  unitSystem={unitSystem}
                  t={t}
                  onAdd={() => setAddMeal(meal)}
                  onRepeat={() => setRepeatMeal(meal)}
                  onEdit={setEditingEntry}
                  onMove={setMovingEntry}
                  onDelete={setDeletingEntry}
                />
              );
            })}
          </section>
        </div>

        <aside className="stack" aria-label={t("dashboard.dayType")}>
          <section className="card side-card day-type-card">
            <div className="row-between">
              <h2>{t("dashboard.dayType")}</h2>
              {currentDayType ? (
                <span className="badge accent">
                  {selectedDayTypeId === "default"
                    ? t("dashboard.automatic")
                    : t("dashboard.assigned")}
                </span>
              ) : null}
            </div>
            {currentDayType ? (
              <>
                <div>
                  <p className="day-type-name">{currentDayType.name}</p>
                  <p className="card-hint">{t("dashboard.dayTypePartial")}</p>
                </div>
                <div className="target-grid">
                  <div className="target-item">
                    <span>{t("nutrients.kcal")}</span>
                    <strong>{formatKcal(currentDayType.kcal, language)}</strong>
                  </div>
                  <div className="target-item">
                    <span>{t("nutrients.protein")}</span>
                    <strong>
                      {formatGrams(currentDayType.protein, language)} g
                    </strong>
                  </div>
                  <div className="target-item">
                    <span>{t("nutrients.carbs")}</span>
                    <strong>
                      {formatGrams(currentDayType.carbs, language)} g
                    </strong>
                  </div>
                  <div className="target-item">
                    <span>{t("nutrients.fat")}</span>
                    <strong>
                      {formatGrams(currentDayType.fat, language)} g
                    </strong>
                  </div>
                </div>
                <Link
                  href={`/settings/day-types/${currentDayType.id}`}
                  className="button secondary small"
                >
                  <Icon name="pencil" size={15} />
                  {t("dashboard.editGoals")}
                </Link>
              </>
            ) : (
              <EmptyState
                icon="target"
                title={t("dashboard.noDayType")}
                action={
                  <Link href="/settings/day-types/new" className="button small">
                    <Icon name="plus" size={16} />
                    {t("dayTypes.new")}
                  </Link>
                }
              >
                {t("dashboard.noDayTypeHelp")}
              </EmptyState>
            )}

            {dayTypes.length > 0 ? (
              <div className="field">
                <label htmlFor="day-type-select">
                  {t("dayTypes.selectLabel")}
                </label>
                <select
                  id="day-type-select"
                  name="dayTypeId"
                  className="select"
                  value={selectedDayTypeId}
                  disabled={switchingDayType}
                  aria-describedby="day-type-help"
                  onChange={(event) => changeDayType(event.currentTarget.value)}
                >
                  <option value="default">
                    {t("dashboard.useDefault")}
                    {defaultDayTypeId
                      ? ` · ${
                          dayTypes.find(
                            (type) => type.id === defaultDayTypeId,
                          )?.name ?? ""
                        }`
                      : ""}
                  </option>
                  {dayTypes.map((type) => (
                    <option value={type.id} key={type.id}>
                      {type.name} · {formatKcal(type.kcal, language)} kcal
                    </option>
                  ))}
                </select>
                <p className="field-hint" id="day-type-help">
                  {t("dayTypes.assignHelp")}
                </p>
              </div>
            ) : null}
          </section>

          <section className="card side-card">
            <h2>{t("dashboard.quickActions")}</h2>
            <div className="quick-actions">
              <button
                type="button"
                className="quick-action"
                onClick={() => setAddMeal("breakfast")}
              >
                <Icon name="plus" size={17} />
                {t("dashboard.addFood")}
              </button>
              <button
                type="button"
                className="quick-action"
                onClick={() => setCopyOpen(true)}
              >
                <Icon name="copy" size={17} />
                {t("dashboard.copyDay")}
              </button>
              <button
                type="button"
                className="quick-action"
                onClick={() => setSavedMealOpen(true)}
              >
                <Icon name="book" size={17} />
                {t("dashboard.addSavedMeal")}
              </button>
              <Link href="/history" className="quick-action">
                <Icon name="chart" size={17} />
                {t("dashboard.weekOverview")}
              </Link>
            </div>
          </section>

          <section className="card side-card">
            <h2>{t("dashboard.nutrientBreakdown")}</h2>
            <div className="nutrient-list">
              {(
                [
                  ["sugars", displayNutrients.sugars],
                  ["satFat", displayNutrients.satFat],
                  ["fiber", displayNutrients.fiber],
                  ["salt", displayNutrients.salt],
                ] as const
              )
                .filter(
                  ([key]) =>
                    key === "satFat" || dashboardNutrients.includes(key),
                )
                .map(([key, total]) => {
                const label =
                  key === "satFat"
                    ? t("nutrients.saturatedFat")
                    : t(`nutrients.${key}` as TranslationKey);
                const formatted =
                  total.value === null
                    ? null
                    : key === "salt"
                      ? formatSalt(total.value, language)
                      : formatGrams(total.value, language);
                return (
                  <div className="nutrient-row" key={key}>
                    <span>{label}</span>
                    <strong className={formatted === null ? "unknown" : ""}>
                      {formatted !== null ? `${formatted} g` : t("common.unknown")}
                      {total.missingEntries > 0 && formatted !== null ? (
                        <span className="subtle">*</span>
                      ) : null}
                    </strong>
                  </div>
                );
              })}
            </div>
            {Object.values(displayNutrients).some(
              (total) => total.missingEntries > 0,
            ) ? (
              <p className="source-note">* {t("dashboard.partialTotal")}</p>
            ) : null}
          </section>
        </aside>
      </div>

      {addMeal !== null ? (
        <AddFoodDialog
          open
          onClose={() => setAddMeal(null)}
          initialMeal={addMeal}
          date={date}
          language={language}
          unitSystem={unitSystem}
          favorites={favorites}
          recent={recent}
          customFoods={customFoods}
          usdaEnabled={usdaEnabled}
          onAdded={finish}
        />
      ) : null}

      {editingEntry ? (
        <EditEntryDialog
          entry={editingEntry}
          language={language}
          unitSystem={unitSystem}
          onClose={() => setEditingEntry(null)}
          onDone={finish}
        />
      ) : null}

      {movingEntry ? (
        <MoveEntryDialog
          entry={movingEntry}
          language={language}
          onClose={() => setMovingEntry(null)}
          onDone={finish}
        />
      ) : null}

      {deletingEntry ? (
        <DeleteEntryDialog
          entry={deletingEntry}
          language={language}
          onClose={() => setDeletingEntry(null)}
          onDone={finish}
        />
      ) : null}

      {repeatMeal ? (
        <RepeatMealDialog
          sourceDate={date}
          sourceMeal={repeatMeal}
          language={language}
          onClose={() => setRepeatMeal(null)}
          onDone={finish}
        />
      ) : null}

      {copyOpen ? (
        <CopyDayDialog
          currentDate={date}
          language={language}
          onClose={() => setCopyOpen(false)}
          onDone={finish}
        />
      ) : null}

      {savedMealOpen ? (
        <AddSavedMealDialog
          savedMeals={savedMeals}
          date={date}
          initialMeal="breakfast"
          language={language}
          unitSystem={unitSystem}
          onClose={() => setSavedMealOpen(false)}
          onDone={finish}
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

function WeekStrip({
  date,
  today,
  language,
  onChange,
}: {
  date: string;
  today: string;
  language: Language;
  onChange: (date: string) => void;
}) {
  const t = getTranslator(language);
  const days = weekDates(startOfWeek(date));
  const labels = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
  ] as const;
  return (
    <div className="week-strip" aria-label={t("dashboard.pickDate")}>
      <button
        type="button"
        className="week-nav-button"
        aria-label={t("dashboard.previousDay")}
        onClick={() => onChange(addDays(date, -7))}
      >
        <Icon name="chevron-left" size={16} />
      </button>
      {days.map((iso, index) => (
        <button
          key={iso}
          type="button"
          className={`week-day${iso === today ? " is-today" : ""}`}
          aria-current={iso === date ? "date" : undefined}
          onClick={() => onChange(iso)}
        >
          <span>{t(`weekdays.${labels[index]}` as TranslationKey)}</span>
          <b>{Number(iso.slice(8, 10))}</b>
        </button>
      ))}
      <button
        type="button"
        className="week-nav-button"
        aria-label={t("dashboard.nextDay")}
        onClick={() => onChange(addDays(date, 7))}
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </div>
  );
}

function MacroCard({
  name,
  color,
  consumed,
  target,
  language,
  t,
}: {
  name: string;
  color: "protein" | "carbs" | "fat";
  consumed: DiaryTotals["nutrients"][keyof DiaryTotals["nutrients"]];
  target: number | null;
  language: Language;
  t: Translator;
}) {
  const value = consumed.value;
  const remaining =
    value !== null && target !== null ? target - value : null;
  const over = remaining !== null && remaining < 0;
  const label =
    target !== null
      ? t("a11y.macroProgress", {
          name,
          consumed: formatGrams(value, language),
          target: formatGrams(target, language),
        })
      : name;
  return (
    <div className={`macro-tile ${color}`}>
      <div className="macro-line">
        <span className="macro-name">
          <span className={`macro-dot ${color}`} />
          {name}
        </span>
        <span className="macro-figure">
          {target !== null ? `${formatGrams(target, language)} g` : "—"}
        </span>
      </div>
      <div className="macro-value">
        {formatGrams(value, language)}
        <small>g</small>
      </div>
      <ProgressBar
        value={value}
        max={target}
        label={label}
        colorClass={color}
        over={over}
      />
      <span className="macro-caption">
        {consumed.missingEntries > 0
          ? t("history.partial")
          : remaining !== null
            ? over
              ? t("dashboard.macroOver", {
                  value: formatGrams(Math.abs(remaining), language),
                })
              : t("dashboard.macroRemaining", {
                  value: formatGrams(remaining, language),
                })
            : t("dashboard.targetNotSet")}
      </span>
    </div>
  );
}

function MealSection({
  meal,
  entries,
  language,
  unitSystem,
  t,
  onAdd,
  onRepeat,
  onEdit,
  onMove,
  onDelete,
}: {
  meal: Meal;
  entries: DiaryEntry[];
  language: Language;
  unitSystem: UnitSystem;
  t: Translator;
  onAdd: () => void;
  onRepeat: () => void;
  onEdit: (entry: DiaryEntry) => void;
  onMove: (entry: DiaryEntry) => void;
  onDelete: (entry: DiaryEntry) => void;
}) {
  const mealLabel = t(`meals.${meal}` as TranslationKey);
  const totals = totalNutrients(
    entries.map((entry) => {
      const portion = entryPortion(entry);
      return {
        nutrients: portion.nutrients,
        energySource: entry.energySource,
      };
    }),
  );
  const kcal = totals.nutrients.kcal;
  const subtotal =
    entries.length === 0
      ? `${formatKcal(0, language)} kcal`
      : kcal.value === null
        ? t("common.unknown")
        : `${formatKcal(kcal.value, language)} kcal`;
  const macroBits = entries.length
    ? (
        [
          ["dayTypes.proteinShort", totals.nutrients.protein.value],
          ["dayTypes.carbsShort", totals.nutrients.carbs.value],
          ["dayTypes.fatShort", totals.nutrients.fat.value],
        ] as const
      )
        .filter(([, value]) => value !== null)
        .map(
          ([key, value]) =>
            `${t(key)} ${formatGrams(value, language)} g`,
        )
    : [];
  return (
    <article className="meal-card" data-meal={meal}>
      <div className="meal-header">
        <MealIcon meal={meal} />
        <div className="meal-heading">
          <strong>{mealLabel}</strong>
          <span>
            {entries.length === 1
              ? t("dashboard.entryCountOne")
              : t("dashboard.entryCount", { count: entries.length })}
            {kcal.missingEntries > 0 ? ` · ${t("history.partial")}` : ""}
            {macroBits.length > 0 ? ` · ${macroBits.join(" · ")}` : ""}
          </span>
        </div>
        <span className="meal-kcal">{subtotal}</span>
        <div className="meal-actions">
          {entries.length > 0 ? (
            <>
              <button
                type="button"
                className="icon-button small ghost"
                onClick={onRepeat}
                aria-label={`${t("dashboard.repeatMeal")} · ${mealLabel}`}
                title={t("dashboard.repeatMeal")}
              >
                <Icon name="repeat" size={16} />
              </button>
              <button
                type="button"
                className="button small secondary"
                onClick={onAdd}
                aria-label={t("dashboard.addFoodTo", { meal: mealLabel })}
              >
                <Icon name="plus" size={16} />
                <span>{t("dashboard.addFood")}</span>
              </button>
            </>
          ) : null}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="meal-empty">
          <button
            type="button"
            className="meal-empty-button"
            onClick={onAdd}
          >
            <Icon name="plus" size={17} />
            {t("dashboard.mealEmpty")} · {t("dashboard.addFood")}
          </button>
        </div>
      ) : (
        <ul className="entry-list">
          {entries.map((entry) => {
            const portion = entryPortion(entry);
            const entryKcal = portion.nutrients.kcal;
            return (
              <li className="entry-row" key={entry.id}>
                <FoodThumb name={entry.name} imageUrl={entry.imageUrl} size={38} />
                <div className="entry-main">
                  <span className="entry-name">{entry.name}</span>
                  <span className="entry-meta">
                    {entry.brand ? <span>{entry.brand}</span> : null}
                    <SourceBadge source={entry.source} language={language} />
                    <PreparationBadge
                      preparation={entry.preparation}
                      language={language}
                    />
                    <span>
                      {formatPortion(
                        entry.amount,
                        entry.amountUnit,
                        unitSystem,
                        language,
                        t,
                      )}
                    </span>
                    {entry.energySource === "calculated" ? (
                      <span>{t("search.energyCalculated")}</span>
                    ) : null}
                    {entry.nutrients.protein === null ||
                    entry.nutrients.carbs === null ||
                    entry.nutrients.fat === null ? (
                      <span>{t("history.partial")}</span>
                    ) : null}
                  </span>
                </div>
                <div className="entry-kcal">
                  {entryKcal === null
                    ? t("common.unknown")
                    : `${formatKcal(entryKcal, language)} kcal`}
                  <span>
                    {portion.nutrients.protein === null
                      ? "—"
                      : `${formatGrams(portion.nutrients.protein, language)} ${t("dayTypes.proteinShort")}`}
                    {" · "}
                    {portion.nutrients.carbs === null
                      ? "—"
                      : `${formatGrams(portion.nutrients.carbs, language)} ${t("dayTypes.carbsShort")}`}
                    {" · "}
                    {portion.nutrients.fat === null
                      ? "—"
                      : `${formatGrams(portion.nutrients.fat, language)} ${t("dayTypes.fatShort")}`}
                  </span>
                </div>
                <div className="entry-actions">
                  <button
                    type="button"
                    className="icon-button small ghost"
                    onClick={() => onEdit(entry)}
                    aria-label={t("entry.edit", { name: entry.name })}
                    title={t("common.edit")}
                  >
                    <Icon name="pencil" size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button small ghost"
                    onClick={() => onMove(entry)}
                    aria-label={t("entry.move", { name: entry.name })}
                    title={t("entry.moveTitle")}
                  >
                    <Icon name="calendar" size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button small ghost danger"
                    onClick={() => onDelete(entry)}
                    aria-label={t("entry.delete", { name: entry.name })}
                    title={t("common.delete")}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
