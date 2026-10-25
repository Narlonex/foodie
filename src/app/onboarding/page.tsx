import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { OnboardingView } from "@/components/onboarding-view";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("onboarding.title");
}

export default async function OnboardingPage() {
  const viewer = await requireViewer();
  if (viewer.profile.onboardingCompleted) redirect("/");
  const t = getTranslator(viewer.profile.language);
  const profile = viewer.profile;

  return (
    <main className="onboarding-page" id="main">
      <header className="onboarding-bar">
        <span className="brand">
          <BrandMark />
          <span className="brand-text">{t("app.name")}</span>
        </span>
      </header>
      <OnboardingView
        language={profile.language}
        hasDefaultDayType={profile.defaultDayTypeId !== null}
        profile={{
          language: profile.language,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          age: profile.age,
          sex: profile.sex,
          activityLevel: profile.activityLevel,
          goalMode: profile.goalMode,
        }}
      />
    </main>
  );
}
