"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { assignDayTypeAction } from "@/actions/dayTypes";
import { getTranslator, type TranslationKey, type Translator } from "@/i18n";
import { addDays, formatLongDate } from "@/lib/dates";
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
import { DeleteEntryDialog, EditEntryDialog } from "./entry-dialogs";
import { Icon } from "./icons";
import { EmptyState, MealIcon, ProgressBar, SourceBadge } from "./ui";

export function DashboardView({
  date,
  today,
  language,
  unitSystem,
  dayType,
  assignedDayTypeId,
  dayTypes,
  defaultDayTypeId,
  entries,
  totals,
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
  dayType: DayType | null;
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
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [addMeal, setAddMeal] = useState<Meal | null>(null);
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<DiaryEntry | null>(null);
  const [repeatMeal, setRepeatMeal] = useState<Meal | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [savedMealOpen, setSavedMealOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
  const consumed = displayNutrients.kcal.value;
  const target = dayType?.kcal ?? null;
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
    setDeletingEntry(null);
    setRepeatMeal(null);
    setCopyOpen(false);
    setSavedMealOpen(false);
    setToast(message);
    router.refresh();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("dashboard.title")}</p>
          <h1>{formatLongDate(date, language)}</h1>
          <p className="page-subtitle">
            {dayType
              ? assignedDayTypeId
                ? t("dashboard.dayTypeAssigned", { name: dayType.name })
                : t("dashboard.dayTypeDefault", { name: dayType.name })
              : t("dashboard.noDayTypeHelp")}
          </p>
        </div>
        <DateNavigation
          date={date}
          today={today}
          language={language}
          onChange={(next) => router.push(`/?date=${next}`)}
        />
      </div>

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
              <div>
                <h2 id="calorie-summary" className="card-title">
                  {t("dashboard.dailyTotals")}
                </h2>
                <p className="card-hint">
                  {dayType
                    ? t("dashboard.ofTarget", {
                        target: formatKcal(target, language),
                      })
                    : t("dashboard.noTarget")}
                </p>
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

          <section aria-labelledby="macro-heading" className="stack-sm">
            <div className="row-between">
              <h2 id="macro-heading" className="card-title">
                {t("dashboard.macros")}
              </h2>
              <span className="small muted">{t("dashboard.macrosHelp")}</span>
            </div>
            <div className="macro-grid">
              <MacroCard
                name={t("nutrients.protein")}
                color="protein"
                consumed={displayNutrients.protein}
                target={dayType?.protein ?? null}
                language={language}
                t={t}
              />
              <MacroCard
                name={t("nutrients.carbs")}
                color="carbs"
                consumed={displayNutrients.carbs}
                target={dayType?.carbs ?? null}
                language={language}
                t={t}
              />
              <MacroCard
                name={t("nutrients.fat")}
                color="fat"
                consumed={displayNutrients.fat}
                target={dayType?.fat ?? null}
                language={language}
                t={t}
              />
            </div>
          </section>

          {entries.length === 0 ? (
            <div className="card card-pad">
              <EmptyState
                icon="bowl"
                title={t("dashboard.noEntriesToday")}
                action={
                  <div className="row" style={{ justifyContent: "center" }}>
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
                }
              >
                {t("dashboard.noEntriesHelp")}
              </EmptyState>
            </div>
          ) : null}

          <section className="meals-section" aria-label={t("dashboard.mealsTitle")}>
            <h2 className="sr-only">{t("dashboard.mealsTitle")}</h2>
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
              {dayType ? (
                <span className="badge accent">
                  {assignedDayTypeId
                    ? t("dashboard.assigned")
                    : t("dashboard.automatic")}
                </span>
              ) : null}
            </div>
            {dayType ? (
              <>
                <div>
                  <p className="day-type-name">{dayType.name}</p>
                  <p className="card-hint">{t("dashboard.dayTypePartial")}</p>
                </div>
                <div className="target-grid">
                  <div className="target-item">
                    <span>{t("nutrients.kcal")}</span>
                    <strong>{formatKcal(dayType.kcal, language)}</strong>
                  </div>
                  <div className="target-item">
                    <span>{t("nutrients.protein")}</span>
                    <strong>{formatGrams(dayType.protein, language)} g</strong>
                  </div>
                  <div className="target-item">
                    <span>{t("nutrients.carbs")}</span>
                    <strong>{formatGrams(dayType.carbs, language)} g</strong>
                  </div>
                  <div className="target-item">
                    <span>{t("nutrients.fat")}</span>
                    <strong>{formatGrams(dayType.fat, language)} g</strong>
                  </div>
                </div>
                <Link
                  href={`/settings/day-types/${dayType.id}`}
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
              <form action={assignDayTypeAction} className="stack-sm">
                <input type="hidden" name="date" value={date} />
                <div className="field">
                  <label htmlFor="day-type-select">
                    {t("dayTypes.selectLabel")}
                  </label>
                  <select
                    id="day-type-select"
                    name="dayTypeId"
                    className="select"
                    defaultValue={assignedDayTypeId ?? "default"}
                    aria-describedby="day-type-help"
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
                <button type="submit" className="button secondary small">
                  {t("common.change")}
                </button>
              </form>
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
              ).map(([key, total]) => {
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

function DateNavigation({
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
  return (
    <div className="date-nav" aria-label={t("dashboard.pickDate")}>
      <button
        type="button"
        className="icon-button"
        aria-label={t("dashboard.previousDay")}
        onClick={() => onChange(addDays(date, -1))}
      >
        <Icon name="chevron-left" size={18} />
      </button>
      <label className="sr-only" htmlFor="dashboard-date">
        {t("dashboard.pickDate")}
      </label>
      <input
        id="dashboard-date"
        type="date"
        className="date-input"
        value={date}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      />
      <button
        type="button"
        className="icon-button"
        aria-label={t("dashboard.nextDay")}
        onClick={() => onChange(addDays(date, 1))}
      >
        <Icon name="chevron-right" size={18} />
      </button>
      <button
        type="button"
        className="button secondary small"
        onClick={() => onChange(today)}
        disabled={date === today}
      >
        {t("dashboard.today")}
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
    <div className="macro-card">
      <div className="macro-top">
        <span>
          <span className={`macro-dot ${color}`} />
          {name}
        </span>
        {consumed.missingEntries > 0 ? (
          <span className="badge warning">{t("history.partial")}</span>
        ) : null}
      </div>
      <div className="macro-value">
        {formatGrams(value, language)} g{" "}
        <small>
          / {target !== null ? `${formatGrams(target, language)} g` : "—"}
        </small>
      </div>
      <ProgressBar
        value={value}
        max={target}
        label={label}
        colorClass={color}
        over={over}
      />
      <div className="progress-caption">
        <span>{t("dashboard.consumed")}</span>
        <span>
          {value === null
            ? t("common.unknown")
            : target === null
              ? t("dashboard.targetNotSet")
              : remaining !== null && over
                ? t("dashboard.macroOver", {
                    value: formatGrams(Math.abs(remaining), language),
                  })
                : t("dashboard.macroRemaining", {
                    value: formatGrams(remaining, language),
                  })}
        </span>
      </div>
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
    <article className="meal-card">
      <div className="meal-header">
        <MealIcon meal={meal} />
        <div className="meal-heading">
          <strong>{mealLabel}</strong>
          <span>
            {subtotal} ·{" "}
            {entries.length === 1
              ? t("dashboard.entryCountOne")
              : t("dashboard.entryCount", { count: entries.length })}
            {kcal.missingEntries > 0 ? ` · ${t("history.partial")}` : ""}
            {macroBits.length > 0 ? ` · ${macroBits.join(" · ")}` : ""}
          </span>
        </div>
        <div className="meal-actions">
          {entries.length > 0 ? (
            <button
              type="button"
              className="icon-button small ghost"
              onClick={onRepeat}
              aria-label={`${t("dashboard.repeatMeal")} · ${mealLabel}`}
              title={t("dashboard.repeatMeal")}
            >
              <Icon name="repeat" size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="button small secondary"
            onClick={onAdd}
            aria-label={t("dashboard.addFoodTo", { meal: mealLabel })}
          >
            <Icon name="plus" size={16} />
            <span>{t("dashboard.addFood")}</span>
          </button>
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
                <div className="entry-main">
                  <span className="entry-name">{entry.name}</span>
                  <span className="entry-meta">
                    {entry.brand ? <span>{entry.brand}</span> : null}
                    <SourceBadge source={entry.source} language={language} />
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
