"use client";

import { useTransition } from "react";
import { skipOnboardingAction } from "@/actions/settings";
import { getTranslator } from "@/i18n";
import type { Language } from "@/lib/types";

export function OnboardingSkip({ language }: { language: Language }) {
  const t = getTranslator(language);
  const [pending, startTransition] = useTransition();

  return (
    <div className="onboarding-skip">
      <button
        type="button"
        className="button ghost"
        disabled={pending}
        onClick={() => startTransition(() => skipOnboardingAction())}
      >
        {pending ? t("common.saving") : t("onboarding.skip")}
      </button>
      <p className="field-hint">{t("onboarding.skipped")}</p>
    </div>
  );
}
