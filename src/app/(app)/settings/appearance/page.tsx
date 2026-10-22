import { AppearanceForm } from "@/components/settings-forms";
import { SettingsDetail } from "@/components/settings-detail";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("settings.appearance");
}

export default async function AppearanceSettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  return (
    <SettingsDetail
      title={t("appearance.title")}
      intro={t("appearance.intro")}
      t={t}
    >
      <AppearanceForm
        language={viewer.profile.language}
        currentTheme={viewer.profile.theme}
      />
    </SettingsDetail>
  );
}
