import { SettingsDetail } from "@/components/settings-detail";
import { LanguageForm } from "@/components/settings-forms";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("settings.language");
}

export default async function LanguageSettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  return (
    <SettingsDetail
      title={t("language.title")}
      intro={t("language.intro")}
      t={t}
    >
      <LanguageForm language={viewer.profile.language} />
    </SettingsDetail>
  );
}
