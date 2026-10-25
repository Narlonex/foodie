"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBodyMetricsAction } from "@/actions/settings";
import { initialFormState } from "@/actions/types";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { estimateMaintenanceCalories } from "@/lib/metrics";
import { suggestedMacroTargets } from "@/lib/macroTargets";
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  type GoalMode,
  type Language,
  type Sex,
} from "@/lib/types";

const ACTIVITY_LABEL_KEYS: Record<ActivityLevel, TranslationKey> = {
  sedentary: "metrics.activitySedentary",
  light: "metrics.activityLight",
  moderate: "metrics.activityModerate",
  active: "metrics.activityActive",
  very_active: "metrics.activityVeryActive",
};

function parseOptional(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function BodyMetricsForm({
  language,
  mode,
  heightCm,
  weightKg,
  age,
  sex,
  activityLevel,
  goalMode,
  hasDefaultDayType,
}: {
  language: Language;
  mode: "settings" | "onboarding";
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  goalMode: GoalMode;
  hasDefaultDayType: boolean;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    saveBodyMetricsAction,
    initialFormState,
  );
  const [height, setHeight] = useState(heightCm ? String(heightCm) : "");
  const [weight, setWeight] = useState(weightKg ? String(weightKg) : "");
  const [ageValue, setAgeValue] = useState(age ? String(age) : "");
  const [sexValue, setSexValue] = useState<Sex | "">(sex ?? "");
  const [activity, setActivity] = useState<ActivityLevel | "">(
    activityLevel ?? "",
  );
  const [goal, setGoal] = useState<GoalMode>(goalMode);

  useEffect(() => {
    if (state.status === "success" && mode === "settings") router.refresh();
  }, [state.status, mode, router]);

  const maintenance = estimateMaintenanceCalories({
    heightCm: parseOptional(height),
    weightKg: parseOptional(weight),
    age: parseOptional(ageValue),
    sex: sexValue === "" ? null : sexValue,
    activityLevel: activity === "" ? null : activity,
  });
  const suggestion =
    maintenance === null ? null : suggestedMacroTargets(maintenance, goal);

  const message =
    state.status === "success" && state.message
      ? translate(language, state.message as TranslationKey)
      : null;
  const error =
    state.status === "error" && state.message
      ? translate(language, state.message as TranslationKey)
      : null;
  const errorFor = (field: string) =>
    state.fieldErrors?.[field]
      ? translate(language, state.fieldErrors[field] as TranslationKey)
      : null;

  return (
    <div className="stack">
      <form action={formAction} className="card card-pad stack">
        <input type="hidden" name="context" value={mode} />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="metrics-height">{t("metrics.height")}</label>
            <input
              id="metrics-height"
              name="heightCm"
              className="input"
              inputMode="decimal"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              placeholder="180"
              aria-invalid={errorFor("heightCm") ? true : undefined}
            />
            {errorFor("heightCm") ? (
              <p className="field-error">{errorFor("heightCm")}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="metrics-weight">{t("metrics.weight")}</label>
            <input
              id="metrics-weight"
              name="weightKg"
              className="input"
              inputMode="decimal"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              placeholder="75"
              aria-invalid={errorFor("weightKg") ? true : undefined}
            />
            {errorFor("weightKg") ? (
              <p className="field-error">{errorFor("weightKg")}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="metrics-age">{t("metrics.age")}</label>
            <input
              id="metrics-age"
              name="age"
              className="input"
              inputMode="numeric"
              value={ageValue}
              onChange={(event) => setAgeValue(event.target.value)}
              placeholder="30"
              aria-invalid={errorFor("age") ? true : undefined}
            />
            {errorFor("age") ? (
              <p className="field-error">{errorFor("age")}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="metrics-sex">{t("metrics.sex")}</label>
            <select
              id="metrics-sex"
              name="sex"
              className="select"
              value={sexValue}
              onChange={(event) => setSexValue(event.target.value as Sex | "")}
            >
              <option value="">{t("common.unknown")}</option>
              <option value="female">{t("metrics.sexFemale")}</option>
              <option value="male">{t("metrics.sexMale")}</option>
              <option value="other">{t("metrics.sexOther")}</option>
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="metrics-activity">{t("metrics.activity")}</label>
            <select
              id="metrics-activity"
              name="activityLevel"
              className="select"
              value={activity}
              onChange={(event) =>
                setActivity(event.target.value as ActivityLevel | "")
              }
            >
              <option value="">{t("common.unknown")}</option>
              {ACTIVITY_LEVELS.map((level) => (
                <option value={level} key={level}>
                  {t(ACTIVITY_LABEL_KEYS[level])}
                </option>
              ))}
            </select>
            <p className="field-hint">{t("metrics.optional")}</p>
          </div>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: 10 }}>
            {mode === "onboarding" ? t("onboarding.goalTitle") : t("metrics.goal")}
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
                  checked={goal === value}
                  onChange={() => setGoal(value)}
                />
                <span className="radio-copy">
                  <strong>
                    {label} {goal === value ? `· ${t("a11y.selected")}` : ""}
                  </strong>
                  <span>{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="field-hint">{t("metrics.goalHint")}</p>
        </fieldset>

        <div className="metrics-estimate">
          <div>
            <span className="field-label">{t("onboarding.suggestion")}</span>
            {suggestion ? (
              <p className="metrics-estimate-kcal">
                {suggestion.kcal} kcal
                <span>
                  {t("dayTypes.proteinShort")} {Math.round(suggestion.protein)} g
                  {" · "}
                  {t("dayTypes.carbsShort")} {Math.round(suggestion.carbs)} g
                  {" · "}
                  {t("dayTypes.fatShort")} {Math.round(suggestion.fat)} g
                </span>
              </p>
            ) : (
              <p className="field-hint">{t("metrics.estimateMissing")}</p>
            )}
          </div>
          <p className="source-note">
            {suggestion ? t("onboarding.suggestionHint") : t("metrics.estimateHint")}
          </p>
        </div>

        {hasDefaultDayType && suggestion ? (
          <label className="checkbox-row">
            <input type="checkbox" name="applySuggestion" defaultChecked />
            <span>{t("onboarding.apply")}</span>
          </label>
        ) : null}

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

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="button" disabled={pending}>
            {pending
              ? t("common.saving")
              : mode === "onboarding"
                ? t("onboarding.continue")
                : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
