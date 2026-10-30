"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createCustomFoodAction,
  updateCustomFoodAction,
} from "@/actions/foods";
import { initialFormState } from "@/actions/types";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import {
  NUTRIENT_KEYS,
  type Food,
  type Language,
  type NutrientKey,
} from "@/lib/types";
import { Dialog } from "./dialog";
import { FoodPhotoField } from "./food-photo-field";

function nutrientUnit(key: NutrientKey): string {
  if (key === "kcal") return "kcal";
  if (key === "kj") return "kJ";
  return "g";
}

function nutrientLabelKey(key: NutrientKey): string {
  return key === "satFat" ? "nutrients.saturatedFat" : `nutrients.${key}`;
}

export function CustomFoodDialog({
  food,
  initialBarcode,
  language,
  onClose,
  onDone,
}: {
  food?: Food;
  /** Barcode of a packaged product that neither source could identify. */
  initialBarcode?: string;
  language: Language;
  onClose: () => void;
  onDone: (message: string, food?: Food) => void;
}) {
  const t = getTranslator(language);
  const action = food ? updateCustomFoodAction : createCustomFoodAction;
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [basis, setBasis] = useState(food?.basisType ?? "100g");

  useEffect(() => {
    if (state.status === "success" && state.message) {
      onDone(
        translate(language, state.message as TranslationKey),
        state.createdFood,
      );
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
      description={
        initialBarcode
          ? t("foods.customBarcodeHint", { barcode: initialBarcode })
          : t("foods.customHint")
      }
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
              {t("foods.brand")}{" "}
              <span className="subtle">({t("common.optional")})</span>
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
              defaultValue={food?.barcode ?? initialBarcode ?? ""}
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
          <div className="field">
            <label htmlFor="food-preparation">{t("preparation.label")}</label>
            <select
              id="food-preparation"
              name="preparation"
              className="select"
              defaultValue={food?.preparation ?? "unspecified"}
            >
              <option value="unspecified">{t("preparation.unspecified")}</option>
              <option value="raw">{t("preparation.raw")}</option>
              <option value="cooked">{t("preparation.cooked")}</option>
            </select>
            <p className="field-hint">{t("preparation.help")}</p>
          </div>
          <div className="field">
            <label htmlFor="food-package-quantity">
              {t("package.quantity")}{" "}
              <span className="subtle">({t("common.optional")})</span>
            </label>
            <input
              id="food-package-quantity"
              name="packageQuantity"
              className="input"
              inputMode="decimal"
              defaultValue={food?.packageQuantity ?? ""}
              aria-describedby="food-package-hint"
            />
            {errorFor("packageQuantity") ? (
              <p className="field-error">{errorFor("packageQuantity")}</p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="food-package-unit">{t("package.unit")}</label>
            <select
              id="food-package-unit"
              name="packageUnit"
              className="select"
              defaultValue={food?.packageUnit ?? "g"}
            >
              <option value="g">{t("units.g")}</option>
              <option value="ml">{t("units.ml")}</option>
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="food-drained-weight">
              {t("package.drainedWeight")}{" "}
              <span className="subtle">({t("common.optional")})</span>
            </label>
            <input
              id="food-drained-weight"
              name="drainedWeight"
              className="input"
              inputMode="decimal"
              defaultValue={food?.drainedWeight ?? ""}
            />
            {errorFor("drainedWeight") ? (
              <p className="field-error">{errorFor("drainedWeight")}</p>
            ) : null}
            <p className="field-hint" id="food-package-hint">
              {t("package.help")}
            </p>
          </div>
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
                  {t(nutrientLabelKey(key) as TranslationKey)} (
                  {nutrientUnit(key)})
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
