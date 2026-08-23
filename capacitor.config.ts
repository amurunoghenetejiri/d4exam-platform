import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Template for when you have a laptop and run:
 *   npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
 *   npx cap init
 *   npx cap add android && npx cap add ios
 *   npm run build && npx cap sync
 *
 * Do not run native builds until Android Studio / Xcode are available.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    // For live reload during native dev only; leave commented in production builds.
    // url: "https://d4exam-platform.vercel.app",
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#070D1B",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
