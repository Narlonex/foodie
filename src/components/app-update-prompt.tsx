"use client";

import { useEffect, useState } from "react";
import { getTranslator } from "@/i18n";
import type { Language } from "@/lib/types";
import { isNewerVersion } from "@/lib/version";
import { Icon } from "./icons";

const SEEN_KEY = "foodie.update.seenVersion";
const BASELINE_VERSION = "1.1.0";

function isAndroidNativeApp(): boolean {
  const ua = window.navigator.userAgent;
  if (!/Android/i.test(ua)) return false;
  if (/FoodieAndroid\/\d+(?:\.\d+){0,2}/i.test(ua)) return true;
  if (/\bwv\b/i.test(ua)) return true;
  const capacitor = (
    window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function installedVersion(): string | null {
  return (
    window.navigator.userAgent.match(
      /FoodieAndroid\/(\d+(?:\.\d+){0,2})/i,
    )?.[1] ?? null
  );
}

function readSeenVersion(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function rememberVersion(version: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Storage can be unavailable in private mode.
  }
}

/**
 * In-app update notice for the Capacitor shell. The web app is loaded from
 * production, so this starts working in an already installed APK without a
 * native rebuild. It only appears when a release newer than the last seen
 * version is published.
 */
export function AppUpdatePrompt({
  language,
  latestVersion,
  apkUrl,
}: {
  language: Language;
  latestVersion: string;
  apkUrl: string;
}) {
  const t = getTranslator(language);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!apkUrl || !isAndroidNativeApp()) return;

    const installed = installedVersion();
    if (installed && !isNewerVersion(latestVersion, installed)) {
      rememberVersion(latestVersion);
      return;
    }

    const seen = readSeenVersion();
    if (!seen) {
      if (isNewerVersion(latestVersion, BASELINE_VERSION)) {
        const timer = window.setTimeout(() => setVisible(true), 0);
        return () => window.clearTimeout(timer);
      } else {
        rememberVersion(latestVersion);
      }
      return;
    }

    if (isNewerVersion(latestVersion, seen)) {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [apkUrl, latestVersion]);

  function dismiss() {
    rememberVersion(latestVersion);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      className="app-update-prompt"
      role="status"
      aria-live="polite"
      aria-label={t("update.aria")}
    >
      <div className="app-update-prompt-head">
        <span className="empty-icon small-icon">
          <Icon name="download" size={18} />
        </span>
        <div className="app-update-prompt-copy">
          <strong>{t("update.title")}</strong>
          <p>{t("update.body", { version: latestVersion })}</p>
        </div>
        <button
          type="button"
          className="install-prompt-close"
          onClick={dismiss}
          aria-label={t("update.later")}
        >
          ×
        </button>
      </div>
      <div className="app-update-prompt-actions">
        <a
          className="button small"
          href={apkUrl}
          download
          onClick={dismiss}
        >
          <Icon name="download" size={15} />
          {t("update.download", { version: latestVersion })}
        </a>
        <button type="button" className="button ghost small" onClick={dismiss}>
          {t("update.later")}
        </button>
      </div>
    </aside>
  );
}
