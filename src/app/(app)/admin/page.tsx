import { redirect } from "next/navigation";
import { AdminView } from "@/components/admin-view";
import { SettingsDetail } from "@/components/settings-detail";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import {
  getCatalogQuality,
  getCatalogStats,
  listCatalogSearchMisses,
} from "@/lib/repositories/catalog";
import {
  listCatalogImportRuns,
  listFoodSubmissions,
  listRecentCatalogFoods,
} from "@/lib/repositories/catalogAdmin";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("admin.title");
}

export default async function AdminPage() {
  const viewer = await requireViewer();
  if (viewer.profile.isAdmin !== true) redirect("/settings");
  const t = getTranslator(viewer.profile.language);
  const [stats, quality, submissions, misses, runs, recent] = await Promise.all([
    getCatalogStats(),
    getCatalogQuality(),
    listFoodSubmissions("pending", 50),
    listCatalogSearchMisses(30),
    listCatalogImportRuns(10),
    listRecentCatalogFoods(8),
  ]);

  return (
    <SettingsDetail title={t("admin.title")} intro={t("admin.intro")} t={t}>
      <AdminView
        language={viewer.profile.language}
        stats={stats}
        quality={quality}
        submissions={submissions}
        misses={misses}
        runs={runs}
        recent={recent}
      />
    </SettingsDetail>
  );
}
