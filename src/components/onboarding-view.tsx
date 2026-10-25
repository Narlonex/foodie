"use client";

import { OnboardingSkip } from "./onboarding-skip";
import { BodyMetricsForm } from "./body-metrics-form";
import { getTranslator } from "@/i18n";
import type {
  ActivityLevel,
  GoalMode,
  Language,
  Sex,
} from "@/lib/types";

interface ProfileSnippet {
  language: Language;
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  sex: Sex | null;
  activityLevel: ActivityLevel | null;
  goalMode: GoalMode;
}

export function OnboardingView({
  language,
  profile,
  hasDefaultDayType,
}: {
  language: Language;
  profile: ProfileSnippet;
  hasDefaultDayType: boolean;
}) {
  const t = getTranslator(language);

  return (
    <div className="onboarding">
      <div className="onboarding-head">
        <p className="eyebrow">{t("onboarding.title")}</p>
        <h1>{t("onboarding.welcome")}</h1>
        <p className="page-subtitle">{t("onboarding.intro")}</p>
      </div>

      <div className="onboarding-grid">
        <div className="stack">
          <BodyMetricsForm
            language={language}
            mode="onboarding"
            heightCm={profile.heightCm}
            weightKg={profile.weightKg}
            age={profile.age}
            sex={profile.sex}
            activityLevel={profile.activityLevel}
            goalMode={profile.goalMode}
            hasDefaultDayType={hasDefaultDayType}
          />
        </div>

        <aside className="onboarding-aside">
          <section className="card card-pad stack">
            <h2 className="card-title">{t("onboarding.tip")}</h2>
            <p className="field-hint">{t("onboarding.tipBody")}</p>
          </section>
          <div className="onboarding-skip-inline">
            <OnboardingSkip language={language} />
          </div>
        </aside>
      </div>
    </div>
  );
}
