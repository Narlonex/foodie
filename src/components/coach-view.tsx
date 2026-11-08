"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptCoachInviteAction,
  createCoachInviteAction,
  leaveCoachAction,
  revokeCoachClientAction,
} from "@/actions/coach";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import { formatNumber } from "@/lib/format";
import type {
  ClientCoach,
  CoachClientSummary,
  CoachInvite,
} from "@/lib/repositories/coach";
import type { Language } from "@/lib/types";
import { Icon } from "./icons";

export function CoachView({
  language,
  myCoach,
  clients,
  invites,
}: {
  language: Language;
  myCoach: ClientCoach | null;
  clients: CoachClientSummary[];
  invites: CoachInvite[];
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function showResult(result: {
    ok: boolean;
    message?: string;
    error?: string;
  }) {
    if (result.ok) {
      setNotice(result.message ? t(result.message as TranslationKey) : null);
      setError(null);
      router.refresh();
    } else {
      setError(translate(language, result.error as TranslationKey));
      setNotice(null);
    }
  }

  function join(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      showResult(await acceptCoachInviteAction({ code }));
    });
  }

  function createInvite() {
    startTransition(async () => {
      const result = await createCoachInviteAction();
      showResult(result);
      if (result.ok && result.data?.code) {
        setNotice(t("coach.inviteCreated"));
      }
    });
  }

  function revoke(clientId: string) {
    startTransition(async () => {
      showResult(await revokeCoachClientAction(clientId));
    });
  }

  function leave() {
    if (!myCoach) return;
    startTransition(async () => {
      showResult(await leaveCoachAction(myCoach.coachId));
    });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError(t("coach.copyFailed"));
    }
  }

  return (
    <div className="stack">
      <p className="source-note">{t("coach.privacyNote")}</p>

      <section className="card card-pad stack">
        <h2 className="card-title">{t("coach.myCoachTitle")}</h2>
        {myCoach ? (
          <>
            <p className="card-hint">{t("coach.myCoachHelp", { email: myCoach.email })}</p>
            <div className="row-between entity-row">
              <span className="entity-main">
                <strong>{myCoach.email}</strong>
                <span className="entity-meta">
                  {t("coach.since", { date: myCoach.since.slice(0, 10) })}
                </span>
              </span>
              <button
                type="button"
                className="button secondary small"
                onClick={leave}
                disabled={pending}
              >
                {t("coach.leave")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="card-hint">{t("coach.joinHelp")}</p>
            <form className="stack-sm" onSubmit={join}>
              <label className="field">
                <span className="field-label">{t("coach.inviteCode")}</span>
                <input
                  className="input code-input"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder={t("coach.codePlaceholder")}
                  maxLength={16}
                  required
                />
              </label>
              <button type="submit" className="button" disabled={pending}>
                <Icon name="user" size={17} />
                {pending ? t("common.saving") : t("coach.join")}
              </button>
            </form>
          </>
        )}
      </section>

      <section className="card card-pad stack">
        <div className="row-between">
          <div>
            <h2 className="card-title">{t("coach.inviteTitle")}</h2>
            <p className="card-hint">{t("coach.inviteHelp")}</p>
          </div>
          <button type="button" className="button secondary small" onClick={createInvite} disabled={pending}>
            <Icon name="plus" size={16} />
            {t("coach.createInvite")}
          </button>
        </div>
        {invites.length === 0 ? (
          <p className="empty-state compact">{t("coach.noInvites")}</p>
        ) : (
          <ul className="entity-list">
            {invites.map((invite) => (
              <li className="entity-row" key={invite.id}>
                <span className="entity-main">
                  <strong className="code-value">{invite.code}</strong>
                  <span className="entity-meta">
                    {invite.usedAt
                      ? t("coach.used")
                      : t("coach.expires", { date: invite.expiresAt.slice(0, 10) })}
                  </span>
                </span>
                {!invite.usedAt ? (
                  <button
                    type="button"
                    className="icon-button small ghost"
                    aria-label={t("coach.copyCode")}
                    onClick={() => void copy(invite.code)}
                  >
                    <Icon name={copied === invite.code ? "check" : "copy"} size={16} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card card-pad stack">
        <div className="row-between">
          <div>
            <h2 className="card-title">{t("coach.clientsTitle")}</h2>
            <p className="card-hint">{t("coach.clientsHelp")}</p>
          </div>
          <span className="badge">{t("coach.lastSeven")}</span>
        </div>
        {clients.length === 0 ? (
          <p className="empty-state compact">{t("coach.noClients")}</p>
        ) : (
          <ul className="entity-list">
            {clients.map((client) => (
              <li className="coach-client" key={client.clientId}>
                <div className="row-between">
                  <strong>{client.email}</strong>
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={() => revoke(client.clientId)}
                    disabled={pending}
                  >
                    {t("coach.revoke")}
                  </button>
                </div>
                <div className="coach-metrics">
                  <span>
                    <strong>{client.loggedDays}/7</strong> {t("coach.loggedDays")}
                  </span>
                  <span>
                    <strong>
                      {client.avgKcal === null
                        ? "—"
                        : `${formatNumber(client.avgKcal, language, 0)} kcal`}
                    </strong>{" "}
                    {t("coach.avgKcal")}
                  </span>
                  <span>
                    <strong>
                      {client.avgProtein === null
                        ? "—"
                        : `${formatNumber(client.avgProtein, language, 0)} g`}
                    </strong>{" "}
                    {t("coach.avgProtein")}
                  </span>
                  <span>
                    <strong>
                      {client.latestWeightKg === null
                        ? "—"
                        : `${formatNumber(client.latestWeightKg, language, 1)} kg`}
                    </strong>{" "}
                    {t("coach.latestWeight")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
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
