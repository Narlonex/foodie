"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandMark } from "./brand-mark";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPromptLabels = {
  title: string;
  body: string;
  iosBody: string;
  iosOther: string;
  button: string;
  dismiss: string;
  aria: string;
};

const DISMISS_KEY = "foodie.install.dismissed";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1)
  );
}

function isIosBrowser() {
  return /CriOS|FxiOS|EdgiOS/i.test(window.navigator.userAgent);
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function readDismissedAt() {
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY) ?? "0");
  } catch {
    return 0;
  }
}

export function InstallPrompt({ labels }: { labels: InstallPromptLabels }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<"android" | "ios" | "ios-browser" | null>(
    null,
  );
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/download") || isStandalone() || !isMobileViewport()) {
      return;
    }

    const dismissedAt = readDismissedAt();
    if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_MS) {
      return;
    }

    if (isIos()) {
      // Defer the initial browser-only decision until after hydration.
      const timer = window.setTimeout(() => {
        setMode(isIosBrowser() ? "ios-browser" : "ios");
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setMode("android");
    };

    const onInstalled = () => {
      setMode(null);
      setPromptEvent(null);
      try {
        window.localStorage.removeItem(DISMISS_KEY);
      } catch {
        // Storage can be unavailable in private mode.
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [pathname]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage can be unavailable in private mode.
    }
    setMode(null);
    setPromptEvent(null);
  };

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setMode(null);
      setPromptEvent(null);
    } else {
      dismiss();
    }
  };

  if (!mode) return null;

  const body =
    mode === "ios-browser" ? labels.iosOther : mode === "ios" ? labels.iosBody : labels.body;

  return (
    <aside
      className="install-prompt"
      role="region"
      aria-label={labels.aria}
    >
      <div className="install-prompt-brand">
        <BrandMark />
      </div>
      <div className="install-prompt-copy">
        <strong>{labels.title}</strong>
        <p>{body}</p>
      </div>
      <button
        type="button"
        className="install-prompt-close"
        onClick={dismiss}
        aria-label={labels.dismiss}
      >
        ×
      </button>
      <div className="install-prompt-actions">
        {mode === "android" ? (
          <button type="button" className="button small" onClick={install}>
            {labels.button}
          </button>
        ) : null}
        <button
          type="button"
          className="button ghost small"
          onClick={dismiss}
        >
          {labels.dismiss}
        </button>
      </div>
    </aside>
  );
}
