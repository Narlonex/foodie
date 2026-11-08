"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createHouseholdAction,
  joinHouseholdAction,
  leaveHouseholdAction,
} from "@/actions/household";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import type { Language } from "@/lib/types";
import type { Household } from "@/lib/repositories/households";
import { Icon } from "./icons";

export function HouseholdView({
  household,
  language,
}: {
  household: Household | null;
  language: Language;
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function showResult(result: { ok: boolean; message?: string; error?: string }) {
    if (result.ok) {
      setNotice(result.message ? t(result.message as TranslationKey) : null);
      setError(null);
      router.refresh();
    } else {
      setError(translate(language, result.error as TranslationKey));
      setNotice(null);
    }
  }

  function create(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      showResult(await createHouseholdAction({ name }));
    });
  }

  function join(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      showResult(await joinHouseholdAction({ code }));
    });
  }

  function leave() {
    startTransition(async () => {
      showResult(await leaveHouseholdAction());
    });
  }

  async function copyInvite() {
    if (!household) return;
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t("household.copyFailed"));
    }
  }

  if (!household) {
    return (
      <div className="stack">
        <section className="card card-pad stack">
          <h2 className="card-title">{t("household.createTitle")}</h2>
          <p className="card-hint">{t("household.createHelp")}</p>
          <form className="stack-sm" onSubmit={create}>
            <label className="field">
              <span className="field-label">{t("household.name")}</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("household.namePlaceholder")}
                maxLength={80}
                required
              />
            </label>
            <button type="submit" className="button" disabled={pending}>
              <Icon name="plus" size={17} />
              {pending ? t("common.saving") : t("household.create")}
            </button>
          </form>
        </section>

        <section className="card card-pad stack">
          <h2 className="card-title">{t("household.joinTitle")}</h2>
          <p className="card-hint">{t("household.joinHelp")}</p>
          <form className="stack-sm" onSubmit={join}>
            <label className="field">
              <span className="field-label">{t("household.inviteCode")}</span>
              <input
                className="input code-input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder={t("household.codePlaceholder")}
                maxLength={16}
                required
              />
            </label>
            <button type="submit" className="button secondary" disabled={pending}>
              <Icon name="user" size={17} />
              {pending ? t("common.saving") : t("household.join")}
            </button>
          </form>
        </section>

        {error ? (
          <p className="notice error" role="alert">
            <Icon name="alert" size={17} />
            <span>{error}</span>
          </p>
        ) : null}
        {notice ? (
          <p className="notice success" role="status">
            <Icon name="check" size={17} />
            <span>{notice}</span>
          </p>
        ) : null}
      </div>
    );
  }

  const isOwner = household.ownerId === household.members.find((member) => member.role === "owner")?.userId;

  return (
    <div className="stack">
      <section className="card card-pad stack">
        <div className="row-between">
          <div>
            <h2 className="card-title">{household.name}</h2>
            <p className="card-hint">
              {t("household.memberCount", { count: household.members.length })}
            </p>
          </div>
          <span className="badge">{t(isOwner ? "household.owner" : "household.member")}</span>
        </div>

        <div className="code-box">
          <div>
            <span className="field-label">{t("household.inviteCode")}</span>
            <strong className="code-value">{household.inviteCode}</strong>
          </div>
          <button type="button" className="button secondary small" onClick={() => void copyInvite()}>
            <Icon name="copy" size={16} />
            {copied ? t("household.copied") : t("household.copy")}
          </button>
        </div>
        <p className="source-note">{t("household.inviteHelp")}</p>
      </section>

      <section className="card card-pad stack">
        <h2 className="card-title">{t("household.members")}</h2>
        <ul className="entity-list">
          {household.members.map((member) => (
            <li className="entity-row" key={member.userId}>
              <span className="avatar" aria-hidden="true">
                {member.email.slice(0, 1).toUpperCase()}
              </span>
              <span className="entity-main">
                <strong>{member.email}</strong>
                <span className="entity-meta">
                  {t(member.role === "owner" ? "household.owner" : "household.member")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card card-pad stack">
        <h2 className="card-title">{t("household.leaveTitle")}</h2>
        <p className="card-hint">{t("household.leaveHelp")}</p>
        <button
          type="button"
          className="button secondary"
          onClick={leave}
          disabled={pending}
        >
          <Icon name="logout" size={16} />
          {pending ? t("common.saving") : t("household.leave")}
        </button>
      </section>

      {error ? (
        <p className="notice error" role="alert">
          <Icon name="alert" size={17} />
          <span>{error}</span>
        </p>
      ) : null}
      {notice ? (
        <p className="notice success" role="status">
          <Icon name="check" size={17} />
          <span>{notice}</span>
        </p>
      ) : null}
    </div>
  );
}
