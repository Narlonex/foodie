"use client";

import { useState, useTransition } from "react";
import {
  copyDayAction,
  previewCopyDayAction,
  previewRepeatMealAction,
  repeatMealAction,
} from "@/actions/diary";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { addDays } from "@/lib/dates";
import type { Language } from "@/lib/types";
import { Dialog } from "./dialog";
import { Icon } from "./icons";

interface CopyPreview {
  sourceDate: string;
  targetDate: string;
  sourceCount: number;
  targetCount: number;
  hasSourceAssignment: boolean;
}

export function CopyDayDialog({
  currentDate,
  language,
  onClose,
  onDone,
}: {
  currentDate: string;
  language: Language;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [sourceDate, setSourceDate] = useState(addDays(currentDate, -1));
  const [targetDate, setTargetDate] = useState(currentDate);
  const [copyDayType, setCopyDayType] = useState(false);
  const [preview, setPreview] = useState<CopyPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function check() {
    setError(null);
    setPreview(null);
    if (sourceDate === targetDate) {
      setError(t("copyDay.errorSameDate"));
      return;
    }
    startTransition(async () => {
      const result = await previewCopyDayAction({
        sourceDate,
        targetDate,
        copyDayType,
      });
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      setPreview(result.data ?? null);
    });
  }

  function copy() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await copyDayAction({
        sourceDate,
        targetDate,
        allowExisting: preview.targetCount > 0,
        copyDayType,
      });
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(
        t("copyDay.done", { count: result.data?.copied ?? preview.sourceCount }),
      );
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("copyDay.title")}
      description={t("copyDay.intro")}
      language={language}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="button"
            onClick={copy}
            disabled={!preview || pending || preview.sourceCount === 0}
          >
            <Icon name="copy" size={16} />
            {pending ? t("common.loading") : t("copyDay.confirm")}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="copy-source">{t("copyDay.from")}</label>
            <input
              id="copy-source"
              type="date"
              className="input"
              value={sourceDate}
              onChange={(event) => {
                setSourceDate(event.target.value);
                setPreview(null);
                setError(null);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="copy-target">{t("copyDay.to")}</label>
            <input
              id="copy-target"
              type="date"
              className="input"
              value={targetDate}
              onChange={(event) => {
                setTargetDate(event.target.value);
                setPreview(null);
                setError(null);
              }}
            />
          </div>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={copyDayType}
            onChange={(event) => {
              setCopyDayType(event.target.checked);
              setPreview(null);
            }}
          />
          <span>
            <strong>{t("copyDay.copyType")}</strong>
            <br />
            <span className="field-hint">{t("copyDay.copyTypeHelp")}</span>
          </span>
        </label>

        <button
          type="button"
          className="button secondary"
          onClick={check}
          disabled={pending || sourceDate === targetDate}
        >
          {t("copyDay.preview")}
        </button>

        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="stack-sm">
            <div className="notice" role="status">
              <Icon name="info" size={18} />
              <span>
                {t("dashboard.entryCount", { count: preview.sourceCount })}
              </span>
            </div>
            {preview.sourceCount === 0 ? (
              <p className="notice warning">{t("copyDay.sourceEmpty")}</p>
            ) : null}
            {preview.targetCount > 0 ? (
              <p className="notice warning">
                {t("copyDay.destinationHas", { count: preview.targetCount })}
              </p>
            ) : null}
            <p className="source-note">{t("copyDay.appendNote")}</p>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

export function RepeatMealDialog({
  sourceDate,
  sourceMeal,
  language,
  onClose,
  onDone,
}: {
  sourceDate: string;
  sourceMeal: "breakfast" | "lunch" | "dinner" | "snacks";
  language: Language;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [targetDate, setTargetDate] = useState(sourceDate);
  const [targetMeal, setTargetMeal] = useState(sourceMeal);
  const [preview, setPreview] = useState<{
    sourceCount: number;
    targetCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function check() {
    setError(null);
    setPreview(null);
    const result = await previewRepeatMealAction({
      sourceDate,
      sourceMeal,
      targetDate,
      targetMeal,
    });
    if (!result.ok) {
      setError(translate(language, result.error as TranslationKey));
      return;
    }
    setPreview(result.data ?? null);
  }

  function repeat() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await repeatMealAction({
        sourceDate,
        sourceMeal,
        targetDate,
        targetMeal,
        allowExisting: preview.targetCount > 0,
      });
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(
        t("repeatMeal.done", { count: result.data?.copied ?? preview.sourceCount }),
      );
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("repeatMeal.title")}
      description={t("repeatMeal.intro")}
      language={language}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="button"
            onClick={repeat}
            disabled={!preview || pending || preview.sourceCount === 0}
          >
            <Icon name="repeat" size={16} />
            {pending ? t("common.loading") : t("repeatMeal.confirm")}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">
          {t("repeatMeal.source", {
            meal: t(`meals.${sourceMeal}` as TranslationKey),
            date: sourceDate,
          })}
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="repeat-date">{t("repeatMeal.toDate")}</label>
            <input
              id="repeat-date"
              type="date"
              className="input"
              value={targetDate}
              onChange={(event) => {
                setTargetDate(event.target.value);
                setPreview(null);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="repeat-meal">{t("repeatMeal.toMeal")}</label>
            <select
              id="repeat-meal"
              className="select"
              value={targetMeal}
              onChange={(event) => {
                setTargetMeal(event.target.value as typeof targetMeal);
                setPreview(null);
              }}
            >
              {(["breakfast", "lunch", "dinner", "snacks"] as const).map(
                (option) => (
                  <option value={option} key={option}>
                    {t(`meals.${option}` as TranslationKey)}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => void check()}
          disabled={pending}
        >
          {t("repeatMeal.preview")}
        </button>
        {error ? (
          <p className="notice error" role="alert">
            {error}
          </p>
        ) : null}
        {preview ? (
          <div className="stack-sm">
            <p className="notice" role="status">
              {t("dashboard.entryCount", { count: preview.sourceCount })}
            </p>
            {preview.sourceCount === 0 ? (
              <p className="notice warning">{t("repeatMeal.empty")}</p>
            ) : null}
            {preview.targetCount > 0 ? (
              <p className="notice warning">
                {t("repeatMeal.destinationHas", {
                  count: preview.targetCount,
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
