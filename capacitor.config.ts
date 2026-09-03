import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config — offline-first native shell
 *
 * Default: load the bundled SPA from webDir (`dist/`), built by
 * `node scripts/prepare-capacitor-dist.mjs` (client-only, no SSR).
 * That works offline for previously cached screens and always boots without Vercel.
 *
 * Optional remote debug shell (not for production APKs):
 *   CAP_REMOTE_URL=1  or  CAP_SERVER_URL=https://...
 */
const remoteUrl =
  process.env["CAP_SERVER_URL"]?.trim() ||
  (process.env["CAP_REMOTE_URL"] === "1" || process.env["CAP_REMOTE_URL"] === "true"
    ? "https://d4exam-platform.vercel.app"
    : "");

const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    androidScheme: "https",
    errorPath: "offline.html",
    // Only attach remote url when explicitly requested for debugging.
    ...(remoteUrl ? { url: remoteUrl } : {}),
    allowNavigation: [
      "d4exam-platform.vercel.app",
      "*.vercel.app",
      "*.supabase.co",
      "*.googleapis.com",
      "*.gstatic.com",
      "*.firebaseio.com",
      "*.firebasestorage.app",
      "*.firebaseapp.com",
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0b1b3a",
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#0b1b3a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b1b3a",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_d4exam",
      iconColor: "#0b1b3a",
      sound: "default",
    },
  },
};

export default config;
