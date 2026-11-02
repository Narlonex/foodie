import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { getTranslator } from "@/i18n";
import { getRequestPreferences, getViewer } from "@/lib/auth";
import { androidRelease } from "@/lib/app-release";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("download.title");
}

export default async function DownloadPage() {
  const { language } = await getRequestPreferences();
  const t = getTranslator(language);
  const viewer = await getViewer().catch(() => null);
  const destination = viewer ? "/" : "/login";
  const accountAction = viewer ? t("download.openApp") : t("download.signIn");

  return (
    <main className="download-page" id="main">
      <header className="download-topbar">
        <Link href="/" className="brand" aria-label={t("download.backHome")}>
          <BrandMark />
          <span className="brand-copy">
            <span className="brand-text">{t("app.name")}</span>
          </span>
        </Link>
        <Link href={destination} className="button secondary small">
          {accountAction}
        </Link>
      </header>

      <section className="download-hero">
        <div className="download-hero-copy">
          <p className="eyebrow">{t("download.badge")}</p>
          <h1>{t("download.title")}</h1>
          <p className="page-subtitle">{t("download.subtitle")}</p>
          <div className="download-hero-actions">
            {androidRelease.available ? (
              <a className="button" href={androidRelease.apkUrl} download>
                {t("download.androidButton")}
              </a>
            ) : null}
            <Link href={destination} className="button secondary">
              {accountAction}
            </Link>
          </div>
        </div>
        <div className="download-visual" aria-hidden="true">
          <BrandMark />
          <span className="download-visual-name">Foodie</span>
          <span className="download-visual-note">
            {t("download.badge")}
          </span>
        </div>
      </section>

      <section className="download-grid" aria-label={t("download.title")}>
        <article className="card download-card">
          <span className="badge accent">Android</span>
          <h2>{t("download.androidTitle")}</h2>
          <p className="card-hint">{t("download.androidBody")}</p>
          {androidRelease.available ? (
            <>
              <div className="download-meta">
                <span className="badge">
                  {t("download.androidVersion", {
                    version: androidRelease.versionName,
                  })}
                </span>
              </div>
              <a className="button wide" href={androidRelease.apkUrl} download>
                {t("download.androidButton")}
              </a>
              {androidRelease.notes ? (
                <div className="download-notes">
                  <p className="field-label">{t("download.releaseNotes")}</p>
                  <p>{androidRelease.notes}</p>
                </div>
              ) : null}
              {androidRelease.sha256 ? (
                <div>
                  <p className="field-label">{t("download.sha256")}</p>
                  <code className="download-sha">{androidRelease.sha256}</code>
                </div>
              ) : null}
            </>
          ) : (
            <p className="notice">{t("download.androidUnavailable")}</p>
          )}
        </article>

        <article className="card download-card">
          <span className="badge">iOS</span>
          <h2>{t("download.iosTitle")}</h2>
          <p className="card-hint">{t("download.iosBody")}</p>
          <Link href="/" className="button wide secondary">
            {t("download.iosButton")}
          </Link>
          <p className="field-hint">{t("download.iosNote")}</p>
        </article>

        <article className="card download-card download-card-wide">
          <span className="badge">Foodie</span>
          <h2>{t("download.accountTitle")}</h2>
          <p className="card-hint">{t("download.accountBody")}</p>
          <div className="download-hero-actions">
            <Link href={destination} className="button">
              {accountAction}
            </Link>
            {!viewer ? (
              <Link href="/register" className="button secondary">
                {t("auth.createOne")}
              </Link>
            ) : null}
          </div>
        </article>
      </section>

      <section className="card card-pad download-security">
        <p className="small muted">{t("download.security")}</p>
      </section>
    </main>
  );
}
