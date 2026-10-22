"use client";

import { useActionState, useState } from "react";
import { deleteDayTypeAction } from "@/actions/dayTypes";
import { initialFormState } from "@/actions/types";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import type { Language } from "@/lib/types";
import { Dialog } from "./dialog";
import { Icon } from "./icons";

export function DeleteDayType({
  dayTypeId,
  dayTypeName,
  assignedDates,
  isDefault,
  language,
}: {
  dayTypeId: string;
  dayTypeName: string;
  assignedDates: number;
  isDefault: boolean;
  language: Language;
}) {
  const t = getTranslator(language);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteDayTypeAction,
    initialFormState,
  );
  const blocked = assignedDates > 0 || isDefault;
  const error =
    state.status === "error" && state.message
      ? translate(language, state.message as TranslationKey)
      : null;

  return (
    <div className="card card-pad stack">
      <h2 className="card-title">{t("common.delete")}</h2>
      {blocked ? (
        <p className="notice warning">
          <Icon name="lock" size={17} />
          <span>
            {isDefault
              ? t("dayTypes.deleteDefault")
              : t("dayTypes.deleteAssigned", { count: assignedDates })}
          </span>
        </p>
      ) : (
        <p className="card-hint">{t("dayTypes.deleteHelp")}</p>
      )}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <button
          type="button"
          className="button danger small"
          disabled={blocked}
          onClick={() => setOpen(true)}
        >
          <Icon name="trash" size={15} />
          {t("common.delete")}
        </button>
      </div>

      {open ? (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={t("dayTypes.deleteTitle")}
          description={t("dayTypes.deleteConfirm", { name: dayTypeName })}
          language={language}
          footer={
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <form action={formAction}>
                <input type="hidden" name="dayTypeId" value={dayTypeId} />
                <button type="submit" className="button danger" disabled={pending}>
                  {pending ? t("common.saving") : t("common.delete")}
                </button>
              </form>
            </>
          }
        >
          <p className="source-note">{t("dayTypes.deleteHelp")}</p>
        </Dialog>
      ) : null}
    </div>
  );
}
