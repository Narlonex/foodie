"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUsdaEnabledAction } from "@/actions/settings";
import { getTranslator } from "@/i18n";
import type { Language } from "@/lib/types";

export function UsdaToggle({
  enabled,
  language,
  available,
}: {
  enabled: boolean;
  language: Language;
  available: boolean;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await updateUsdaEnabledAction(!enabled);
      if (result.status !== "success") {
        setError(t("settings.saveError"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="switch-row">
      <div className="switch-copy">
        <strong id="usda-switch-label">{t("foodData.usdaToggle")}</strong>
        <p className="field-hint">{t("foodData.usdaToggleHelp")}</p>
      </div>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={enabled}
        aria-labelledby="usda-switch-label"
        onClick={toggle}
        disabled={pending || !available}
      >
        <span className="switch-thumb" aria-hidden="true" />
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
