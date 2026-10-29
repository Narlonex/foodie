"use client";

import { useSyncExternalStore } from "react";
import type { Language } from "@/lib/types";

function subscribe(): () => void {
  return () => undefined;
}

function cookieLanguage(): Language {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("foodie_locale="));
  const value = match?.split("=")[1];
  return value === "sk" || value === "cs" ? value : "en";
}

function htmlLanguage(): Language {
  const value = document.documentElement.lang;
  return value === "sk" || value === "cs" ? value : "en";
}

/**
 * Error boundaries cannot read server cookies through props. Read the language
 * from the rendered document cookie on the client and fall back to English for
 * the server snapshot. useSyncExternalStore avoids a cascading setState effect.
 */
export function useClientLanguage(
  source: "html" | "cookie" = "html",
): Language {
  return useSyncExternalStore(
    subscribe,
    source === "cookie" ? cookieLanguage : htmlLanguage,
    () => "en",
  );
}
