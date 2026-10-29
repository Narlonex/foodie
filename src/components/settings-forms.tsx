"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  updateAppearanceAction,
  updateDefaultTargetsAction,
  updateGoalsAction,
  updateLanguageAction,
  updateUnitsAction,
} from "@/actions/settings";
import { initialFormState } from "@/actions/types";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { formatNumber } from "@/lib/format";
import {
  suggestedMacroTargets,
  targetEnergyDifference,
  type MacroTargets,
} from "@/lib/macroTargets";
import { macroEnergy } from "@/lib/nutrition";
import type {
  DayType,
  GoalMode,
  Language,
  Theme,
  UnitSystem,
} from "@/lib/types";
import { Icon } from "./icons";

function translatedMessage(language: Language, message?: string) {
  if (!message) return null;
  return translate(language, message as TranslationKey);
}

export function AppearanceForm({
  language,
  currentTheme,
}: {
  language: Language;
  currentTheme: Theme;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateAppearanceAction,
    initialFormState,
  );
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    if (state.status === "success") {
      document.documentElement.dataset.theme = theme;
      router.refresh();
    }
  }, [state.status, theme, router]);

  const message = translatedMessage(
    language,
    state.status === "success" ? state.message : undefined,
  );
  const error = translatedMessage(
    language,
    state.status === "error" ? state.message : undefined,
  );

  return (
    <form action={formAction} className="stack">
      <div className="card card-pad stack">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 10 }}>
            {t("appearance.theme")}
          </legend>
          <div className="radio-list">
            {(
              [
                ["dark", t("appearance.dark"), t("appearance.darkHint")],
                ["light", t("appearance.light"), t("appearance.lightHint")],
              ] as [Theme, string, string][]
            ).map(([value, label, hint]) => (
              <label className="radio-row" key={value}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => {
                    setTheme(value);
                    document.documentElement.dataset.theme = value;
                  }}
                />
                <span className="radio-copy">
                  <strong>
                    {label} {theme === value ? `· ${t("a11y.selected")}` : ""}
                  </strong>
                  <span>{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="preview-panel">
          <strong className="small">{t("appearance.preview")}</strong>
          <p className="card-hint">{t("appearance.previewText")}</p>
          <div className="row">
            <span className="macro-dot protein" />
            <span className="macro-dot carbs" />
            <span className="macro-dot fat" />
            <span className="badge accent">{t("units.kcal")}</span>
          </div>
        </div>

        {message ? (
          <p className="notice success" role="status">
            <Icon name="check" size={17} />
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>
            {pending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </form>
  );
}

export function LanguageForm({
  language,
}: {
  language: Language;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateLanguageAction,
    initialFormState,
  );
  const [selected, setSelected] = useState<Language>(language);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state.status, router]);

  const message = translatedMessage(
    language,
    state.status === "success" ? state.message : undefined,
  );
  const error = translatedMessage(
    language,
    state.status === "error" ? state.message : undefined,
  );

  return (
    <form action={formAction} className="card card-pad stack">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: 10 }}>
          {t("language.title")}
        </legend>
        <div className="radio-list">
          {(
            [
              ["en", t("language.english"), "English"],
              ["sk", t("language.slovak"), "Slovenčina"],
              ["cs", t("language.czech"), "Čeština"],
            ] as [Language, string, string][]
          ).map(([value, label, native]) => (
            <label className="radio-row" key={value}>
              <input
                type="radio"
                name="language"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
              />
              <span className="radio-copy">
                <strong>
                  {label} {selected === value ? `· ${t("a11y.selected")}` : ""}
                </strong>
                <span>{native}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {message ? (
        <p className="notice success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="source-note">{t("language.note")}</p>
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

export function UnitsForm({
  language,
  currentUnitSystem,
}: {
  language: Language;
  currentUnitSystem: UnitSystem;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateUnitsAction,
    initialFormState,
  );
  const [selected, setSelected] = useState<UnitSystem>(currentUnitSystem);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state.status, router]);

  const message = translatedMessage(
    language,
    state.status === "success" ? state.message : undefined,
  );
  const error = translatedMessage(
    language,
    state.status === "error" ? state.message : undefined,
  );

  return (
    <form action={formAction} className="card card-pad stack">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: 10 }}>
          {t("units.title")}
        </legend>
        <div className="radio-list">
          {(
            [
              ["metric", t("units.metric"), t("units.metricHint")],
              ["imperial", t("units.imperial"), t("units.imperialHint")],
            ] as [UnitSystem, string, string][]
          ).map(([value, label, hint]) => (
            <label className="radio-row" key={value}>
              <input
                type="radio"
                name="unitSystem"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
              />
              <span className="radio-copy">
                <strong>
                  {label} {selected === value ? `· ${t("a11y.selected")}` : ""}
                </strong>
                <span>{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {message ? (
        <p className="notice success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="source-note">{t("units.note")}</p>
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

type TargetKey = "kcal" | "protein" | "carbs" | "fat";

const TARGET_FIELDS: {
  key: TargetKey;
  label: TranslationKey;
  unit: TranslationKey;
}[] = [
  { key: "kcal", label: "dayTypes.calories", unit: "units.kcal" },
  { key: "protein", label: "dayTypes.protein", unit: "units.g" },
  { key: "carbs", label: "dayTypes.carbs", unit: "units.g" },
  { key: "fat", label: "dayTypes.fat", unit: "units.g" },
];

function inputValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

function parseInput(value: string): number {
  const normalized = value.replace(",", ".").trim();
  return normalized === "" ? Number.NaN : Number(normalized);
}

export function GoalsForm({
  language,
  goalMode,
  maintenanceCalories,
  defaultDayType,
}: {
  language: Language;
  goalMode: GoalMode;
  maintenanceCalories: number | null;
  defaultDayType: DayType | null;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateGoalsAction,
    initialFormState,
  );
  const [mode, setMode] = useState<GoalMode>(goalMode);
  const [maintenance, setMaintenance] = useState(
    maintenanceCalories ? String(maintenanceCalories) : "",
  );

  const maintenanceNumber = parseInput(maintenance);
  const validMaintenance =
    maintenance.trim() !== "" &&
    Number.isFinite(maintenanceNumber) &&
    maintenanceNumber >= 500 &&
    maintenanceNumber <= 20_000;
  const suggestion = validMaintenance
    ? suggestedMacroTargets(maintenanceNumber, mode)
    : null;

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state.status, router]);

  const message = translatedMessage(
    language,
    state.status === "success" ? state.message : undefined,
  );
  const error = translatedMessage(
    language,
    state.status === "error" ? state.message : undefined,
  );

  return (
    <div className="stack">
      <form action={formAction} className="card card-pad stack">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 10 }}>
            {t("goals.mode")}
          </legend>
          <div className="radio-list">
            {(
              [
                ["cut", t("goals.cut"), t("goals.cutHint")],
                ["maintenance", t("goals.maintenance"), t("goals.maintenanceHint")],
                ["bulk", t("goals.bulk"), t("goals.bulkHint")],
              ] as [GoalMode, string, string][]
            ).map(([value, label, hint]) => (
              <label className="radio-row" key={value}>
                <input
                  type="radio"
                  name="goalMode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                <span className="radio-copy">
                  <strong>
                    {label} {mode === value ? `· ${t("a11y.selected")}` : ""}
                  </strong>
                  <span>{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="maintenance-calories">
            {t("goals.maintenanceCalories")}{" "}
            <span className="subtle">({t("common.optional")})</span>
          </label>
          <input
            id="maintenance-calories"
            name="maintenanceCalories"
            className="input"
            inputMode="decimal"
            value={maintenance}
            onChange={(event) => setMaintenance(event.target.value)}
            placeholder="2200"
            aria-describedby="maintenance-hint"
          />
          <p className="field-hint" id="maintenance-hint">
            {t("goals.maintenanceHelp")}
          </p>
        </div>

        {message ? (
          <p className="notice success" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : null}
        {state.fieldErrors?.maintenanceCalories ? (
          <p className="field-error">
            {translatedMessage(
              language,
              state.fieldErrors.maintenanceCalories,
            )}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>
            {pending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>

      <ManualTargetsForm
        key={defaultDayType?.id ?? "no-default"}
        language={language}
        defaultDayType={defaultDayType}
        suggestion={suggestion}
      />
    </div>
  );
}

function ManualTargetsForm({
  language,
  defaultDayType,
  suggestion,
}: {
  language: Language;
  defaultDayType: DayType | null;
  suggestion: MacroTargets | null;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateDefaultTargetsAction,
    initialFormState,
  );
  const [values, setValues] = useState<Record<TargetKey, string>>({
    kcal: inputValue(defaultDayType?.kcal ?? null),
    protein: inputValue(defaultDayType?.protein ?? null),
    carbs: inputValue(defaultDayType?.carbs ?? null),
    fat: inputValue(defaultDayType?.fat ?? null),
  });
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state.status, router]);

  const numbers = {
    kcal: parseInput(values.kcal),
    protein: parseInput(values.protein),
    carbs: parseInput(values.carbs),
    fat: parseInput(values.fat),
  };
  const complete = TARGET_FIELDS.every(({ key }) => Number.isFinite(numbers[key]));
  const macroCalories = complete
    ? macroEnergy(numbers.protein, numbers.carbs, numbers.fat)
    : null;
  const difference = complete
    ? targetEnergyDifference(numbers)
    : null;

  const message = translatedMessage(
    language,
    state.status === "success" ? state.message : undefined,
  );
  const error = translatedMessage(
    language,
    state.status === "error" ? state.message : undefined,
  );

  function fillSuggestion() {
    if (!suggestion) return;
    setValues({
      kcal: String(suggestion.kcal),
      protein: String(suggestion.protein),
      carbs: String(suggestion.carbs),
      fat: String(suggestion.fat),
    });
    setFilled(true);
  }

  return (
    <form action={formAction} className="card card-pad stack">
      <div>
        <h2 className="card-title">{t("goals.manualTargets")}</h2>
        <p className="card-hint">{t("goals.manualHelp")}</p>
      </div>

      <p className="source-note">
        {defaultDayType
          ? t("goals.savingTo", { name: defaultDayType.name })
          : t("goals.noDefaultType")}
      </p>

      <div className="form-grid">
        {TARGET_FIELDS.map(({ key, label, unit }) => {
          const fieldError = state.fieldErrors?.[key];
          return (
            <div className="field" key={key}>
              <label htmlFor={`goal-target-${key}`}>
                {t(label)}{" "}
                <span className="subtle">({t(unit)})</span>
              </label>
              <input
                id={`goal-target-${key}`}
                name={key}
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={values[key]}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }));
                  setFilled(false);
                }}
                disabled={!defaultDayType}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={
                  fieldError ? `goal-target-${key}-error` : undefined
                }
              />
              {fieldError ? (
                <p
                  className="field-error"
                  id={`goal-target-${key}-error`}
                  role="alert"
                >
                  {translatedMessage(language, fieldError)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {complete && macroCalories !== null && difference !== null ? (
        <div className="preview-panel">
          <div className="preview-grid">
            <div className="preview-stat">
              <span>{t("nutrients.kcal")}</span>
              <strong>{formatNumber(numbers.kcal, language, 0)}</strong>
            </div>
            <div className="preview-stat">
              <span>{t("nutrients.protein")}</span>
              <strong>{formatNumber(numbers.protein, language, 1)} g</strong>
            </div>
            <div className="preview-stat">
              <span>{t("nutrients.carbs")}</span>
              <strong>{formatNumber(numbers.carbs, language, 1)} g</strong>
            </div>
            <div className="preview-stat">
              <span>{t("nutrients.fat")}</span>
              <strong>{formatNumber(numbers.fat, language, 1)} g</strong>
            </div>
          </div>
          <p className="field-hint">
            {t("goals.macroEnergy", {
              value: formatNumber(macroCalories, language, 0),
            })}
            {Math.abs(difference) > 1
              ? ` · ${t("goals.macroDifference", {
                  value: `${difference > 0 ? "+" : ""}${formatNumber(difference, language, 0)}`,
                })}`
              : ` · ${t("goals.macroBalanced")}`}
          </p>
        </div>
      ) : null}

      <div className="preview-panel">
        <strong className="small">{t("goals.suggestedMacros")}</strong>
        {suggestion ? (
          <>
            <div className="preview-grid">
              <div className="preview-stat">
                <span>{t("nutrients.kcal")}</span>
                <strong>{formatNumber(suggestion.kcal, language, 0)}</strong>
              </div>
              <div className="preview-stat">
                <span>{t("nutrients.protein")}</span>
                <strong>{formatNumber(suggestion.protein, language, 1)} g</strong>
              </div>
              <div className="preview-stat">
                <span>{t("nutrients.carbs")}</span>
                <strong>{formatNumber(suggestion.carbs, language, 1)} g</strong>
              </div>
              <div className="preview-stat">
                <span>{t("nutrients.fat")}</span>
                <strong>{formatNumber(suggestion.fat, language, 1)} g</strong>
              </div>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary small"
                onClick={fillSuggestion}
                disabled={!defaultDayType}
              >
                {t("goals.useSuggestion")}
              </button>
            </div>
            <p className="source-note">{t("goals.suggestionBasis")}</p>
            {filled ? (
              <p className="notice success" role="status">
                {t("goals.suggestionFilled")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="source-note">{t("goals.noMaintenance")}</p>
        )}
      </div>

      {message ? (
        <p className="notice success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="source-note">{t("goals.targetsHint")}</p>

      <div className="form-actions">
        <button
          type="submit"
          className="button"
          disabled={pending || !defaultDayType || !complete}
        >
          {pending ? t("common.saving") : t("goals.saveTargets")}
        </button>
        <Link href="/settings/day-types" className="button secondary">
          <Icon name="calendar" size={16} />
          {t("goals.manageDayTypes")}
        </Link>
      </div>
    </form>
  );
}
