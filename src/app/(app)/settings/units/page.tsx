import { SettingsDetail } from "@/components/settings-detail";
import { UnitsForm } from "@/components/settings-forms";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("settings.units");
}

export default async function UnitsSettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  return (
    <SettingsDetail title={t("units.title")} intro={t("units.intro")} t={t}>
      <UnitsForm
        language={viewer.profile.language}
        currentUnitSystem={viewer.profile.unitSystem}
      />
    </SettingsDetail>
  );
}
