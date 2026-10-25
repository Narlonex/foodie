import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getTranslator } from "@/i18n";
import { requireViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await requireViewer();
  if (!viewer.profile.onboardingCompleted) redirect("/onboarding");
  const t = getTranslator(viewer.profile.language);
  return (
    <AppShell viewer={viewer} t={t}>
      {children}
    </AppShell>
  );
}
