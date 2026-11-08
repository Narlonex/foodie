import { SettingsDetail } from "@/components/settings-detail";
import { HouseholdView } from "@/components/household-view";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { getHousehold } from "@/lib/repositories/households";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("household.title");
}

export default async function HouseholdSettingsPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  const household = await getHousehold(viewer.user.id);

  return (
    <SettingsDetail
      title={t("household.title")}
      intro={t("household.intro")}
      t={t}
    >
      <HouseholdView household={household} language={viewer.profile.language} />
    </SettingsDetail>
  );
}
