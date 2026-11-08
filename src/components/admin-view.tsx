"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { reviewSubmissionAction } from "@/actions/admin";
import { getTranslator, translate, type TranslationKey } from "@/i18n";
import type {
  FoodSubmission,
  ImportRun,
} from "@/lib/repositories/catalogAdmin";
import type { CatalogSearchMiss } from "@/lib/repositories/catalog";
import type { Language } from "@/lib/types";
import { Icon } from "./icons";

interface RecentFood {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  verified: boolean;
  source: string;
  createdAt: string;
}

export function AdminView({
  language,
  stats,
  quality,
  submissions,
  misses,
  runs,
  recent,
}: {
  language: Language;
  stats: { total: number; verified: number; categories: number };
  quality: {
    missingKcal: number;
    missingMacros: number;
    duplicateBarcodes: number;
  };
  submissions: FoodSubmission[];
  misses: CatalogSearchMiss[];
  runs: ImportRun[];
  recent: RecentFood[];
}) {
  const t = getTranslator(language);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function review(submissionId: string, approve: boolean) {
    setPendingId(submissionId);
    startTransition(async () => {
      const result = await reviewSubmissionAction({ submissionId, approve });
      if (result.ok) {
        setNotice(t((result.message ?? "admin.approved") as TranslationKey));
        setError(null);
        router.refresh();
      } else {
        setError(translate(language, result.error as TranslationKey));
      }
      setPendingId(null);
    });
  }

  return (
    <div className="stack">
      <div className="stat-grid">
        <div className="card stat-card">
          <span className="stat-label">{t("admin.totalFoods")}</span>
          <strong>{stats.total.toLocaleString()}</strong>
        </div>
        <div className="card stat-card">
          <span className="stat-label">{t("admin.verifiedFoods")}</span>
          <strong>{stats.verified.toLocaleString()}</strong>
        </div>
        <div className="card stat-card">
          <span className="stat-label">{t("admin.categories")}</span>
          <strong>{stats.categories}</strong>
        </div>
        <div className="card stat-card">
          <span className="stat-label">{t("admin.misses")}</span>
          <strong>{misses.length}</strong>
        </div>
      </div>

      <section className="card card-pad stack">
        <div>
          <h2 className="card-title">{t("admin.qualityTitle")}</h2>
          <p className="card-hint">{t("admin.qualityHelp")}</p>
        </div>
        <div className="stat-grid">
          <div className="card stat-card">
            <span className="stat-label">{t("admin.missingKcal")}</span>
            <strong>{quality.missingKcal.toLocaleString()}</strong>
          </div>
          <div className="card stat-card">
            <span className="stat-label">{t("admin.missingMacros")}</span>
            <strong>{quality.missingMacros.toLocaleString()}</strong>
          </div>
          <div className="card stat-card">
            <span className="stat-label">{t("admin.duplicateBarcodes")}</span>
            <strong>{quality.duplicateBarcodes.toLocaleString()}</strong>
          </div>
        </div>
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

      <section className="card card-pad stack">
        <div className="row-between">
          <div>
            <h2 className="card-title">{t("admin.submissionsTitle")}</h2>
            <p className="card-hint">{t("admin.submissionsHelp")}</p>
          </div>
          <span className="badge">{submissions.length}</span>
        </div>
        {submissions.length === 0 ? (
          <p className="empty-state compact">{t("admin.noSubmissions")}</p>
        ) : (
          <ul className="entity-list">
            {submissions.map((submission) => {
              const busy = pending && pendingId === submission.id;
              return (
                <li className="admin-submission" key={submission.id}>
                  <div className="row-between">
                    <div>
                      <strong>{submission.name}</strong>
                      <span className="entity-meta">
                        {submission.brand ? `${submission.brand} · ` : ""}
                        {t(`category.${submission.category}` as TranslationKey)}
                        {submission.barcode ? ` · ${submission.barcode}` : ""}
                      </span>
                    </div>
                    <span className="badge">{t("admin.pending")}</span>
                  </div>
                  <div className="coach-metrics">
                    <span>
                      <strong>
                        {submission.nutrients.kcal === null
                          ? "—"
                          : `${Math.round(submission.nutrients.kcal)} kcal`}
                      </strong>{" "}
                      {t("admin.per100")}
                    </span>
                    <span>
                      <strong>
                        {submission.nutrients.protein === null
                          ? "—"
                          : `${submission.nutrients.protein.toFixed(1)} g`}
                      </strong>{" "}
                      {t("nutrients.protein")}
                    </span>
                    <span>
                      <strong>
                        {submission.nutrients.carbs === null
                          ? "—"
                          : `${submission.nutrients.carbs.toFixed(1)} g`}
                      </strong>{" "}
                      {t("nutrients.carbs")}
                    </span>
                    <span>
                      <strong>
                        {submission.nutrients.fat === null
                          ? "—"
                          : `${submission.nutrients.fat.toFixed(1)} g`}
                      </strong>{" "}
                      {t("nutrients.fat")}
                    </span>
                  </div>
                  <p className="field-hint">
                    {t("admin.submittedBy", {
                      email: submission.email,
                      date: submission.createdAt.slice(0, 10),
                    })}
                  </p>
                  {submission.notes ? (
                    <p className="source-note">{submission.notes}</p>
                  ) : null}
                  <div className="row">
                    <button
                      type="button"
                      className="button small"
                      disabled={busy}
                      onClick={() => review(submission.id, true)}
                    >
                      <Icon name="check" size={16} />
                      {t("admin.approve")}
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => review(submission.id, false)}
                    >
                      <Icon name="close" size={16} />
                      {t("admin.reject")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card card-pad stack">
        <h2 className="card-title">{t("admin.missesTitle")}</h2>
        <p className="card-hint">{t("admin.missesHelp")}</p>
        {misses.length === 0 ? (
          <p className="empty-state compact">{t("admin.missesEmpty")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("admin.query")}</th>
                  <th>{t("admin.hits")}</th>
                  <th>{t("admin.lastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {misses.map((miss) => (
                  <tr key={miss.id}>
                    <td>{miss.query}</td>
                    <td>{miss.hits}</td>
                    <td>{miss.lastSeenAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card card-pad stack">
        <h2 className="card-title">{t("admin.importsTitle")}</h2>
        <p className="card-hint">{t("admin.importsHelp")}</p>
        {runs.length === 0 ? (
          <p className="empty-state compact">{t("admin.importsEmpty")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("admin.importSource")}</th>
                  <th>{t("admin.importFetched")}</th>
                  <th>{t("admin.importWritten")}</th>
                  <th>{t("admin.importFailed")}</th>
                  <th>{t("admin.importStarted")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.source}</td>
                    <td>{run.fetched}</td>
                    <td>{run.written}</td>
                    <td>{run.failedQueries}</td>
                    <td>{run.startedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card card-pad stack">
        <h2 className="card-title">{t("admin.recentTitle")}</h2>
        <p className="card-hint">{t("admin.recentHelp")}</p>
        <ul className="entity-list">
          {recent.map((food) => (
            <li className="entity-row" key={food.id}>
              <span className="entity-main">
                <strong>{food.name}</strong>
                <span className="entity-meta">
                  {food.brand ? `${food.brand} · ` : ""}
                  {t(`category.${food.category}` as TranslationKey)}
                  {food.verified ? ` · ${t("admin.verified")}` : ""}
                </span>
              </span>
              <span className="badge">{food.source}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
