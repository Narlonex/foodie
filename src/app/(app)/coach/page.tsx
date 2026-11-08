import { SettingsDetail } from "@/components/settings-detail";
import { CoachView } from "@/components/coach-view";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import {
  getClientCoach,
  listCoachClients,
  listCoachInvites,
} from "@/lib/repositories/coach";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("coach.title");
}

export default async function CoachPage() {
  const viewer = await requireViewer();
  const t = getTranslator(viewer.profile.language);
  const [myCoach, clients, invites] = await Promise.all([
    getClientCoach(viewer.user.id),
    listCoachClients(viewer.user.id),
    listCoachInvites(viewer.user.id),
  ]);

  return (
    <SettingsDetail title={t("coach.title")} intro={t("coach.intro")} t={t}>
      <CoachView
        language={viewer.profile.language}
        myCoach={myCoach}
        clients={clients}
        invites={invites}
      />
    </SettingsDetail>
  );
}
