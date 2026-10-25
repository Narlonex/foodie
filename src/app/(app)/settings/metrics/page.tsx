import { BodyMetricsForm } from "@/components/body-metrics-form";
import { SettingsDetail } from "@/components/settings-detail";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("metrics.title");
}

export default async function MetricsSettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  const profile = viewer.profile;

  return (
    <SettingsDetail title={t("metrics.title")} intro={t("metrics.intro")} t={t}>
      <BodyMetricsForm
        language={profile.language}
        mode="settings"
        heightCm={profile.heightCm}
        weightKg={profile.weightKg}
        age={profile.age}
        sex={profile.sex}
        activityLevel={profile.activityLevel}
        goalMode={profile.goalMode}
        hasDefaultDayType={profile.defaultDayTypeId !== null}
      />
    </SettingsDetail>
  );
}
