const configuredApkUrl = process.env.ANDROID_APK_URL?.trim() ?? "";
const apkUrl =
  configuredApkUrl.startsWith("https://") || configuredApkUrl.startsWith("/")
    ? configuredApkUrl
    : "";

export const androidRelease = {
  available: Boolean(apkUrl),
  apkUrl,
  versionName: process.env.ANDROID_VERSION_NAME?.trim() || "1.2.0",
  sha256: process.env.ANDROID_APK_SHA256?.trim() ?? "",
  notes: process.env.ANDROID_APK_NOTES?.trim() ?? "",
};
