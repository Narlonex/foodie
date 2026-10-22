"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  createDayTypeAction,
  updateDayTypeAction,
} from "@/actions/dayTypes";
import { initialFormState } from "@/actions/types";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import {
  DEFAULT_SPLIT,
  deriveMacroTargets,
  type MacroErrorCode,
} from "@/lib/macroTargets";
import { macroEnergy } from "@/lib/nutrition";
import { formatGrams, formatKcal, formatNumber } from "@/lib/format";
import type { DayType, Language, MacroAdjustmentMode } from "@/lib/types";

const MODES: MacroAdjustmentMode[] = ["carbs", "fats", "proteins", "all"];

function toNumber(value: string): number {
  const normalized = value.replace(",", ".").trim();
  if (normalized === "") return Number.NaN;
  return Number(normalized);
}

function modeErrorKey(code: MacroErrorCode): TranslationKey {
  switch (code) {
    case "kcal":
      return "dayTypes.errorKcal";
    case "split":
      return "dayTypes.errorSplit";
    case "negative-carbs":
      return "dayTypes.errorNegativeCarbs";
    case "negative-fats":
      return "dayTypes.errorNegativeFats";
    case "negative-proteins":
      return "dayTypes.errorNegativeProteins";
    default:
      return "dayTypes.errorMacro";
  }
}

function inputValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

export function DayTypeForm({
  language,
  dayType,
}: {
  language: Language;
  dayType?: DayType;
}) {
  const t = getTranslator(language);
  const action = dayType ? updateDayTypeAction : createDayTypeAction;
  const [state, formAction, pending] = useActionState(action, initialFormState);

  const initialSplit = dayType?.split ?? DEFAULT_SPLIT;
  const [name, setName] = useState(dayType?.name ?? "");
  const [kcal, setKcal] = useState(
    dayType ? String(dayType.kcal) : "2000",
  );
  const [protein, setProtein] = useState(
    dayType ? String(dayType.protein) : "150",
  );
  const [carbs, setCarbs] = useState(dayType ? String(dayType.carbs) : "200");
  const [fat, setFat] = useState(dayType ? String(dayType.fat) : "66.67");
  const [mode, setMode] = useState<MacroAdjustmentMode>(
    dayType?.adjustmentMode ?? "all",
  );
  const [proteinPct, setProteinPct] = useState(String(initialSplit.protein));
  const [carbsPct, setCarbsPct] = useState(String(initialSplit.carbs));
  const [fatPct, setFatPct] = useState(String(initialSplit.fat));

  const result = useMemo(
    () =>
      deriveMacroTargets({
        kcal: toNumber(kcal),
        protein: toNumber(protein),
        carbs: toNumber(carbs),
        fat: toNumber(fat),
        adjustmentMode: mode,
        split: {
          protein: toNumber(proteinPct),
          carbs: toNumber(carbsPct),
          fat: toNumber(fatPct),
        },
      }),
    [kcal, protein, carbs, fat, mode, proteinPct, carbsPct, fatPct],
  );

  const splitSum =
    toNumber(proteinPct) + toNumber(carbsPct) + toNumber(fatPct);
  const modeHelp: Record<MacroAdjustmentMode, TranslationKey> = {
    carbs: "dayTypes.changeCarbsHelp",
    fats: "dayTypes.changeFatsHelp",
    proteins: "dayTypes.changeProteinsHelp",
    all: "dayTypes.changeAllHelp",
  };

  const derived = result.ok ? result.targets : null;

  function switchMode(next: MacroAdjustmentMode) {
    if (derived) {
      setProtein(String(derived.protein));
      setCarbs(String(derived.carbs));
      setFat(String(derived.fat));
    }
    setMode(next);
  }

  const generalError =
    state.status === "error" && state.message
      ? translate(language, state.message as TranslationKey)
      : null;

  const editable = {
    protein: mode !== "proteins" && mode !== "all",
    carbs: mode !== "carbs" && mode !== "all",
    fat: mode !== "fats" && mode !== "all",
  };

  const macroField = (
    key: "protein" | "carbs" | "fat",
    label: string,
    value: string,
    setValue: (value: string) => void,
  ) => {
    const isEditable = editable[key];
    const computed = derived ? derived[key] : null;
    return (
      <div className="field">
        <label htmlFor={`day-type-${key}`}>
          {label}{" "}
          <span className="subtle">({t("units.g")})</span>
        </label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            id={`day-type-${key}`}
            name={key}
            className="input"
            inputMode="decimal"
            value={isEditable ? value : computed !== null ? inputValue(computed) : ""}
            onChange={
              isEditable ? (event) => setValue(event.target.value) : undefined
            }
            readOnly={!isEditable}
            aria-describedby={`day-type-${key}-status`}
          />
          <span className="badge">
            {isEditable ? t("dayTypes.fixed") : t("dayTypes.autoCalculated")}
          </span>
        </div>
        <p className="field-hint" id={`day-type-${key}-status`}>
          {isEditable ? t("dayTypes.fixed") : t("dayTypes.autoCalculated")}
        </p>
      </div>
    );
  };

  return (
    <form action={formAction} className="stack">
      {dayType ? (
        <input type="hidden" name="dayTypeId" value={dayType.id} />
      ) : null}
      <input type="hidden" name="adjustmentMode" value={mode} />

      {generalError ? (
        <p className="notice error" role="alert">
          {generalError}
        </p>
      ) : null}

      <div className="card card-pad stack">
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="day-type-name">{t("dayTypes.name")}</label>
            <input
              id="day-type-name"
              name="name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("dayTypes.namePlaceholder")}
              required
              aria-invalid={
                state.fieldErrors?.name ? true : undefined
              }
              data-autofocus
            />
            {state.fieldErrors?.name ? (
              <p className="field-error">
                {translate(language, state.fieldErrors.name as TranslationKey)}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="day-type-kcal">{t("dayTypes.calories")}</label>
            <div className="input-suffix">
              <input
                id="day-type-kcal"
                name="kcal"
                className="input"
                inputMode="decimal"
                value={kcal}
                onChange={(event) => setKcal(event.target.value)}
                aria-invalid={!result.ok && result.code === "kcal" ? true : undefined}
              />
              <span>kcal</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad stack">
        <div>
          <h2 className="card-title">{t("dayTypes.adjustmentTitle")}</h2>
          <p className="card-hint">{t("dayTypes.adjustmentHelp")}</p>
        </div>
        <div
          className="mode-switch-list"
          role="radiogroup"
          aria-label={t("dayTypes.adjustmentTitle")}
        >
          {MODES.map((value) => (
            <label
              key={value}
              className={`mode-switch ${mode === value ? "selected" : ""}`}
            >
              <span className="mode-switch-copy">
                {value === "carbs"
                  ? t("dayTypes.changeCarbs")
                  : value === "fats"
                    ? t("dayTypes.changeFats")
                    : value === "proteins"
                      ? t("dayTypes.changeProteins")
                      : t("dayTypes.changeAll")}
              </span>
              <input
                type="radio"
                className="mode-switch-input"
                name="modeChoice"
                value={value}
                checked={mode === value}
                onChange={() => switchMode(value)}
              />
              <span
                className={`switch ${mode === value ? "is-on" : ""}`}
                aria-hidden="true"
              >
                <span className="switch-thumb" />
              </span>
            </label>
          ))}
        </div>
        <p className="mode-detail">{t(modeHelp[mode])}</p>

        <div className="form-grid">
          {macroField("protein", t("dayTypes.protein"), protein, setProtein)}
          {macroField("carbs", t("dayTypes.carbs"), carbs, setCarbs)}
          {macroField("fat", t("dayTypes.fat"), fat, setFat)}
        </div>
      </div>

      <div className="card card-pad stack">
        <div>
          <h2 className="card-title">{t("dayTypes.split")}</h2>
          <p className="card-hint">{t("dayTypes.splitHelp")}</p>
        </div>
        <div className="form-grid">
          {(
            [
              ["proteinPct", t("dayTypes.splitProtein"), proteinPct, setProteinPct],
              ["carbsPct", t("dayTypes.splitCarbs"), carbsPct, setCarbsPct],
              ["fatPct", t("dayTypes.splitFat"), fatPct, setFatPct],
            ] as [string, string, string, (value: string) => void][]
          ).map(([key, label, value, setValue]) => (
            <div className="field" key={key}>
              <label htmlFor={`day-type-${key}`}>{label} (%)</label>
              <input
                id={`day-type-${key}`}
                name={key}
                className="input"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
          ))}
        </div>
        <p
          className={`badge ${Math.abs(splitSum - 100) <= 0.01 ? "accent" : "danger"}`}
        >
          {t("dayTypes.splitTotal", {
            value: Number.isFinite(splitSum)
              ? formatNumber(splitSum, language, 2)
              : "—",
          })}
        </p>
        <p className="source-note">{t("dayTypes.splitHint")}</p>
      </div>

      <div className="preview-panel">
        <div className="row-between">
          <strong>{t("dayTypes.preview")}</strong>
          <span className="source-note">{t("dayTypes.previewHelp")}</span>
        </div>
        {derived ? (
          <>
            <div className="preview-grid">
              <div className="preview-stat">
                <span>{t("nutrients.kcal")}</span>
                <strong>{formatKcal(derived.kcal, language)}</strong>
              </div>
              <div className="preview-stat">
                <span>{t("nutrients.protein")}</span>
                <strong>{formatGrams(derived.protein, language)} g</strong>
              </div>
              <div className="preview-stat">
                <span>{t("nutrients.carbs")}</span>
                <strong>{formatGrams(derived.carbs, language)} g</strong>
              </div>
              <div className="preview-stat">
                <span>{t("nutrients.fat")}</span>
                <strong>{formatGrams(derived.fat, language)} g</strong>
              </div>
            </div>
            <p className="field-hint">
              {t("dayTypes.macroEnergy", {
                value: formatKcal(
                  macroEnergy(derived.protein, derived.carbs, derived.fat),
                  language,
                ),
              })}
              {Math.abs(
                derived.kcal -
                  macroEnergy(derived.protein, derived.carbs, derived.fat),
              ) > 0.5
                ? ` · ${t("dayTypes.energyDifference", {
                    value: formatNumber(
                      derived.kcal -
                        macroEnergy(
                          derived.protein,
                          derived.carbs,
                          derived.fat,
                        ),
                      language,
                      0,
                    ),
                  })}`
                : ""}
            </p>
          </>
        ) : (
          <p className="notice error" role="alert">
            {t(modeErrorKey(result.ok === false ? result.code : "kcal"))}
          </p>
        )}
        <p className="source-note">{t("dayTypes.targetsNote")}</p>
      </div>

      <div className="form-actions">
        <Link href="/settings/day-types" className="button secondary">
          {t("common.cancel")}
        </Link>
        <button
          type="submit"
          className="button"
          disabled={pending || !result.ok}
        >
          {pending
            ? t("common.saving")
            : dayType
              ? t("dayTypes.save")
              : t("dayTypes.create")}
        </button>
      </div>
    </form>
  );
}
