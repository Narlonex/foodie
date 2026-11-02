import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.narlonex.foodie",
  appName: "Foodie",
  webDir: "android-web",
  server: {
    url: "https://foodie-beige-seven.vercel.app",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: ["foodie-beige-seven.vercel.app"],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#161613",
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#161613",
  },
};

export default config;
