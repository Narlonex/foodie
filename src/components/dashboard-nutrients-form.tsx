"use client";

import { useActionState } from "react";
import { updateDashboardNutrientsAction } from "@/actions/settings";
import { initialFormState } from "@/actions/types";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { DASHBOARD_NUTRIENTS, type DashboardNutrient, type Language } from "@/lib/types";

function labelKey(key: DashboardNutrient): TranslationKey {
  const name = key === "salt" ? "salt" : key;
  return `nutrients.${name}` as TranslationKey;
}

export function DashboardNutrientsForm({
  language,
  selected,
}: {
  language: Language;
  selected: DashboardNutrient[];
}) {
  const t = getTranslator(language);
  const [state, action, pending] = useActionState(
    updateDashboardNutrientsAction,
    initialFormState,
  );

  const message =
    state.status !== "idle" && state.message
      ? translate(language, state.message as TranslationKey)
      : null;

  return (
    <form action={action} className="card card-pad stack">
      <div>
        <h2 className="card-title">{t("dashboard.visibleNutrients")}</h2>
        <p className="field-hint">{t("dashboard.visibleNutrientsHelp")}</p>
      </div>

      <div className="stack-sm">
        {DASHBOARD_NUTRIENTS.map((key) => (
          <label className="checkbox-row" key={key}>
            <input
              type="checkbox"
              name="nutrients"
              value={key}
              defaultChecked={selected.includes(key)}
              disabled={key === "kcal"}
            />
            <span>{t(labelKey(key))}</span>
            {key === "kcal" ? (
              <span className="badge">{t("dashboard.alwaysVisible")}</span>
            ) : null}
          </label>
        ))}
      </div>

      <p className="source-note">{t("dashboard.visibilityNote")}</p>

      {message ? (
        <p
          className={state.status === "error" ? "notice error" : "notice success"}
          role="status"
        >
          {message}
        </p>
      ) : null}

      <div className="row">
        <button type="submit" className="button" disabled={pending}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
        <button
          type="submit"
          name="reset"
          value="1"
          className="button secondary"
          disabled={pending}
        >
          {t("dashboard.resetDefaults")}
        </button>
      </div>
    </form>
  );
}
