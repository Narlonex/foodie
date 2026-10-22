import { DayTypeForm } from "@/components/day-type-form";
import { SettingsDetail } from "@/components/settings-detail";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("dayTypes.new");
}

export default async function NewDayTypePage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  return (
    <SettingsDetail
      title={t("dayTypes.new")}
      intro={t("dayTypes.intro")}
      t={t}
    >
      <DayTypeForm language={viewer.profile.language} />
    </SettingsDetail>
  );
}
