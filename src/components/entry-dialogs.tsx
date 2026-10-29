"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  deleteEntryAction,
  moveEntryAction,
  updateEntryAction,
} from "@/actions/diary";
import { initialFormState } from "@/actions/types";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { formatLongDate } from "@/lib/dates";
import { formatNumber, unitTranslationKey } from "@/lib/format";
import { fromBaseAmount, scaleNutrients, toBaseAmount } from "@/lib/nutrition";
import {
  MEALS,
  type DiaryEntry,
  type Language,
  type Meal,
  type UnitSystem,
} from "@/lib/types";
import { Dialog } from "./dialog";

export function EditEntryDialog({
  entry,
  language,
  unitSystem,
  onClose,
  onDone,
}: {
  entry: DiaryEntry;
  language: Language;
  unitSystem: UnitSystem;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [state, formAction, pending] = useActionState(
    updateEntryAction,
    initialFormState,
  );
  const display = fromBaseAmount(entry.amount, entry.amountUnit, unitSystem);
  const inputUnit =
    entry.amountUnit === "serving"
      ? "serving"
      : entry.amountUnit === "g"
        ? unitSystem === "imperial"
          ? "oz"
          : "g"
        : unitSystem === "imperial"
          ? "floz"
          : "ml";
  const [amount, setAmount] = useState(
    formatNumber(display.value, language, 2),
  );
  const [meal, setMeal] = useState<Meal>(entry.meal);

  const preview = useMemo(() => {
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    try {
      const base = toBaseAmount(
        parsed,
        inputUnit as "g" | "ml" | "oz" | "floz" | "serving",
      );
      if (base.amountUnit !== entry.amountUnit) return null;
      return scaleNutrients(entry, base.amount, base.amountUnit);
    } catch {
      return null;
    }
  }, [amount, entry, inputUnit]);

  useEffect(() => {
    if (state.status === "success" && state.message) {
      onDone(translate(language, state.message as TranslationKey));
    }
  }, [state.status, state.message, language, onDone]);

  const generalError =
    state.message && state.status === "error"
      ? translate(language, state.message as TranslationKey)
      : null;
  const amountError = state.fieldErrors?.amount
    ? translate(language, state.fieldErrors.amount as TranslationKey)
    : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("entry.editTitle")}
      description={entry.name}
      language={language}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="edit-entry-form"
            className="button"
            disabled={pending}
          >
            {pending ? t("common.saving") : t("entry.save")}
          </button>
        </>
      }
    >
      <form id="edit-entry-form" action={formAction} className="stack">
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="displayUnit" value={inputUnit} />
        {generalError ? (
          <p className="notice error" role="alert">
            {generalError}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="entry-amount">{t("entry.amount")}</label>
          <div className="row" style={{ alignItems: "stretch" }}>
            <input
              id="entry-amount"
              name="amount"
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? "entry-amount-error" : undefined}
              data-autofocus
            />
            <span className="badge" style={{ minHeight: 44 }}>
              {t(unitTranslationKey(inputUnit))}
            </span>
          </div>
          {amountError ? (
            <p className="field-error" id="entry-amount-error">
              {amountError}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="entry-meal">{t("entry.meal")}</label>
          <select
            id="entry-meal"
            name="meal"
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
        <div className="preview-panel">
          <strong className="small">{t("search.preview")}</strong>
          {preview ? (
            <div className="preview-grid">
              <div className="preview-stat">
                <span>{t("nutrients.kcal")}</span>
                <strong>
                  {preview.nutrients.kcal === null
                    ? t("common.unknown")
                    : `${formatNumber(preview.nutrients.kcal, language, 0)} kcal`}
                </strong>
              </div>
              <div className="preview-stat">
                <span>{t("nutrients.protein")}</span>
                <strong>
                  {preview.nutrients.protein === null
                    ? t("common.unknown")
                    : `${formatNumber(preview.nutrients.protein, language, 1)} g`}
                </strong>
              </div>
              <div className="preview-stat">
                <span>{t("nutrients.carbs")}</span>
                <strong>
                  {preview.nutrients.carbs === null
                    ? t("common.unknown")
                    : `${formatNumber(preview.nutrients.carbs, language, 1)} g`}
                </strong>
              </div>
              <div className="preview-stat">
                <span>{t("nutrients.fat")}</span>
                <strong>
                  {preview.nutrients.fat === null
                    ? t("common.unknown")
                    : `${formatNumber(preview.nutrients.fat, language, 1)} g`}
                </strong>
              </div>
            </div>
          ) : (
            <p className="field-error">{t("entry.amountInvalid")}</p>
          )}
        </div>
      </form>
    </Dialog>
  );
}

export function MoveEntryDialog({
  entry,
  language,
  onClose,
  onDone,
}: {
  entry: DiaryEntry;
  language: Language;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [date, setDate] = useState(entry.date);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function move(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date || date === entry.date) {
      setError(t("entry.moveSameDate"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await moveEntryAction(entry.id, date);
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(
        translate(language, "entry.moved", {
          date: formatLongDate(date, language),
        }),
      );
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("entry.moveTitle")}
      description={entry.name}
      language={language}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="move-entry-form"
            className="button"
            disabled={pending}
          >
            {pending ? t("common.saving") : t("entry.moveConfirm")}
          </button>
        </>
      }
    >
      <form id="move-entry-form" className="stack" onSubmit={move}>
        <p className="card-hint">{t("entry.moveHelp")}</p>
        <div className="field">
          <label htmlFor="entry-move-date">{t("entry.moveDate")}</label>
          <input
            id="entry-move-date"
            type="date"
            className="input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "entry-move-error" : undefined}
            data-autofocus
          />
        </div>
        {error ? (
          <p className="notice error" id="entry-move-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

export function DeleteEntryDialog({
  entry,
  language,
  onClose,
  onDone,
}: {
  entry: DiaryEntry;
  language: Language;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteEntryAction(entry.id);
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(t("entry.deleted"));
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("entry.deleteTitle")}
      description={t("entry.deleteHelp")}
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
            {pending ? t("common.saving") : t("entry.deleteConfirm")}
          </button>
        </>
      }
    >
      <div className="stack-sm">
        <p>
          <strong>{entry.name}</strong>
          {entry.brand ? ` · ${entry.brand}` : ""}
        </p>
        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
