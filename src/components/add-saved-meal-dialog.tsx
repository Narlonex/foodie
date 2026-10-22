"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addSavedMealAction } from "@/actions/savedMeals";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { formatPortion } from "@/lib/format";
import {
  MEALS,
  type Language,
  type Meal,
  type SavedMeal,
  type UnitSystem,
} from "@/lib/types";
import { Dialog } from "./dialog";
import { Icon } from "./icons";

export function AddSavedMealDialog({
  savedMeals,
  date,
  initialMeal,
  language,
  unitSystem,
  onClose,
  onDone,
}: {
  savedMeals: SavedMeal[];
  date: string;
  initialMeal: Meal;
  language: Language;
  unitSystem: UnitSystem;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const t = getTranslator(language);
  const [selectedId, setSelectedId] = useState(savedMeals[0]?.id ?? "");
  const [targetDate, setTargetDate] = useState(date);
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const result = await addSavedMealAction({
        savedMealId: selectedId,
        date: targetDate,
        meal,
      });
      if (!result.ok) {
        setError(translate(language, result.error as TranslationKey));
        return;
      }
      onDone(t("savedMeals.added"));
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("dashboard.addSavedMeal")}
      description={t("savedMeals.items")}
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
            onClick={add}
            disabled={pending || !selectedId}
          >
            <Icon name="plus" size={16} />
            {pending ? t("common.saving") : t("savedMeals.confirmAdd")}
          </button>
        </>
      }
    >
      {savedMeals.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="book" size={22} />
          </span>
          <h3>{t("savedMeals.empty")}</h3>
          <p>{t("savedMeals.emptyHelp")}</p>
          <Link href="/foods" className="button secondary small">
            {t("savedMeals.manage")}
          </Link>
        </div>
      ) : (
        <div className="stack">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label" style={{ marginBottom: 8 }}>
              {t("savedMeals.title")}
            </legend>
            <div className="radio-list">
              {savedMeals.map((saved) => (
                <label className="radio-row" key={saved.id}>
                  <input
                    type="radio"
                    name="savedMeal"
                    value={saved.id}
                    checked={selectedId === saved.id}
                    onChange={() => setSelectedId(saved.id)}
                  />
                  <span className="radio-copy">
                    <strong>{saved.name}</strong>
                    <span>
                      {t("savedMeals.itemsCount", {
                        count: saved.items.length,
                      })}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="saved-meal-date">
                {t("savedMeals.chooseDate")}
              </label>
              <input
                id="saved-meal-date"
                type="date"
                className="input"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="saved-meal-meal">
                {t("savedMeals.chooseMeal")}
              </label>
              <select
                id="saved-meal-meal"
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
          </div>

          {savedMeals
            .filter((saved) => saved.id === selectedId)
            .map((saved) => (
              <div key={saved.id} className="stack-sm">
                <div className="saved-meal-items">
                  {saved.items.map((item) => (
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
                  ))}
                </div>
              </div>
            ))}

          <p className="source-note">{t("copyDay.appendNote")}</p>
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
