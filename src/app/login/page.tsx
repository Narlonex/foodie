import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { getRequestPreferences, getViewer } from "@/lib/auth";
import { pageMetadata } from "@/lib/pageMetadata";

export async function generateMetadata() {
  return pageMetadata("auth.signIn");
}

export default async function LoginPage() {
  const viewer = await getViewer();
  if (viewer) redirect("/");
  const { language } = await getRequestPreferences();
  return (
    <AuthShell language={language}>
      <AuthForm mode="login" language={language} />
    </AuthShell>
  );
}
