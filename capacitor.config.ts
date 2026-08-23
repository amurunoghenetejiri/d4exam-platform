import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config
 *
 * App identity:
 *   appName  = D4EXAM
 *   appId    = com.d4exam.app
 *
 * Architecture note:
 *   TanStack Start is SSR. A pure static dist shell cannot run auth, server
 *   functions, or CBT correctly offline. The Android WebView therefore loads
 *   the production Vercel deployment so the full existing website works inside
 *   the native shell (camera permissions, splash, package id still native).
 *
 *   webDir is still "dist" so Cap sync / CI have a valid asset folder.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    // Live SSR app — required for auth, exams, notifications, role dashboards.
    url: "https://d4exam-platform.vercel.app",
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
