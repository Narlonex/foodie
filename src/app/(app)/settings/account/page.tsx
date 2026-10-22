import { logoutAction } from "@/actions/auth";
import { SettingsDetail } from "@/components/settings-detail";
import { Icon } from "@/components/icons";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("nav.account");
}

export default async function AccountSettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  return (
    <SettingsDetail title={t("account.title")} t={t}>
      <div className="card card-pad stack">
        <div>
          <p className="field-label">{t("account.email")}</p>
          <p className="account-email">{viewer.user.email}</p>
        </div>
        <p className="source-note">{t("account.dataNote")}</p>
        <p className="card-hint">{t("account.signOutHint")}</p>
        <form action={logoutAction}>
          <button type="submit" className="button secondary">
            <Icon name="logout" size={16} />
            {t("account.signOut")}
          </button>
        </form>
      </div>
    </SettingsDetail>
  );
}
