"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/actions/auth";
import { initialFormState } from "@/actions/types";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import type { Language } from "@/lib/types";
import { BrandMark } from "./brand-mark";
import { Icon } from "./icons";

function errorText(language: Language, key: string | undefined): string | null {
  if (!key) return null;
  return translate(language, key as TranslationKey);
}

export function AuthForm({
  mode,
  language,
}: {
  mode: "login" | "register";
  language: Language;
}) {
  const t = getTranslator(language);
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const isLogin = mode === "login";
  const emailError = errorText(language, state.fieldErrors?.email);
  const passwordError = errorText(language, state.fieldErrors?.password);
  const generalError = errorText(language, state.message);

  return (
    <div className="auth-panel">
      <div className="auth-brand">
        <BrandMark />
        <span>{t("app.name")}</span>
      </div>

      <section className="card auth-card" aria-labelledby="auth-heading">
        <div>
          <p className="eyebrow">{t("app.tagline")}</p>
          <h1 id="auth-heading">
            {isLogin ? t("auth.signInTitle") : t("auth.signUpTitle")}
          </h1>
          <p className="page-subtitle">
            {isLogin ? t("auth.signInSubtitle") : t("auth.signUpSubtitle")}
          </p>
        </div>

        {state.status === "error" && generalError ? (
          <div className="notice error" role="alert">
            <Icon name="alert" size={18} />
            <span>{generalError}</span>
          </div>
        ) : null}

        <form action={formAction} className="auth-form" noValidate>
          <div className="field">
            <label htmlFor="email">{t("auth.email")}</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              inputMode="email"
              required
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError ? (
              <p className="field-error" id="email-error">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="password">{t("auth.password")}</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? undefined : 8}
              required
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={
                isLogin
                  ? passwordError
                    ? "password-error"
                    : undefined
                  : passwordError
                    ? "password-hint password-error"
                    : "password-hint"
              }
            />
            {!isLogin ? (
              <p className="field-hint" id="password-hint">
                {t("auth.passwordHint")}
              </p>
            ) : null}
            {passwordError ? (
              <p className="field-error" id="password-error">
                {passwordError}
              </p>
            ) : null}
          </div>

          {!isLogin ? (
            <div className="field">
              <label htmlFor="language">{t("auth.language")}</label>
              <select
                id="language"
                name="language"
                className="select"
                defaultValue={language}
              >
                <option value="en">{t("language.english")}</option>
                <option value="sk">{t("language.slovak")}</option>
                <option value="cs">{t("language.czech")}</option>
              </select>
            </div>
          ) : null}

          <button type="submit" className="button wide" disabled={pending}>
            {pending
              ? t("common.loading")
              : isLogin
                ? t("auth.signIn")
                : t("auth.signUp")}
          </button>
        </form>

        <p className="auth-footer">
          {isLogin ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
          <Link href={isLogin ? "/register" : "/login"}>
            {isLogin ? t("auth.createOne") : t("auth.signInInstead")}
          </Link>
        </p>
        <p className="field-hint">{t("auth.privacyNote")}</p>
      </section>
    </div>
  );
}
