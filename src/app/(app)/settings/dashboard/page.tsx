import { DashboardNutrientsForm } from "@/components/dashboard-nutrients-form";
import { SettingsDetail } from "@/components/settings-detail";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("settings.dashboard");
}

export default async function DashboardSettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  return (
    <SettingsDetail
      title={t("settings.dashboard")}
      intro={t("dashboard.settingsIntro")}
      t={t}
    >
      <DashboardNutrientsForm
        language={viewer.profile.language}
        selected={viewer.profile.dashboardNutrients}
      />
    </SettingsDetail>
  );
}
