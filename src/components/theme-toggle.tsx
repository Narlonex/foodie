"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setThemeAction } from "@/actions/settings";
import { getTranslator } from "@/i18n";
import type { Language, Theme } from "@/lib/types";
import { Icon } from "./icons";

export function ThemeToggle({
  theme,
  language,
}: {
  theme: Theme;
  language: Language;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const current: Theme = theme;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const next: Theme = current === "dark" ? "light" : "dark";
  const label = next === "dark" ? t("theme.switchToDark") : t("theme.switchToLight");

  function toggle() {
    setError(null);
    document.documentElement.dataset.theme = next;
    startTransition(async () => {
      const result = await setThemeAction(next);
      if (result.status !== "success") {
        document.documentElement.dataset.theme = current;
        setError(t("settings.saveError"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="icon-button"
        onClick={toggle}
        disabled={pending}
        aria-label={label}
        title={label}
      >
        <Icon name={current === "dark" ? "sun" : "moon"} size={18} />
      </button>
      {error ? (
        <span className="sr-only" role="status">
          {error}
        </span>
      ) : null}
    </>
  );
}
