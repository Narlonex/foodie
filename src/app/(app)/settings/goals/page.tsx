import { SettingsDetail } from "@/components/settings-detail";
import { GoalsForm } from "@/components/settings-forms";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { getDayType } from "@/lib/repositories/dayTypes";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("settings.nutritionGoals");
}

export default async function GoalsSettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  const defaultDayType = viewer.profile.defaultDayTypeId
    ? await getDayType(viewer.user.id, viewer.profile.defaultDayTypeId)
    : null;

  return (
    <SettingsDetail title={t("goals.title")} intro={t("goals.intro")} t={t}>
      <GoalsForm
        language={viewer.profile.language}
        goalMode={viewer.profile.goalMode}
        maintenanceCalories={viewer.profile.maintenanceCalories}
        defaultDayType={defaultDayType}
      />
    </SettingsDetail>
  );
}
