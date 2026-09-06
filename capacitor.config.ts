import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config — OFFLINE-FIRST local shell (WhatsApp-style).
 *
 * NO server.url: the APK loads bundled assets from webDir (dist/), so the
 * app opens offline after the first online sync. Data still syncs from
 * Supabase when online; exam start / new content requires network.
 *
 * Build path: node scripts/prepare-capacitor-dist.mjs → dist/ SPA shell
 * (vite.capacitor.config.ts + server stubs). Do not point at Vercel.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    // Local-only: do NOT set url (that forced Vercel and broke offline).
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0b1b3a",
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // Hold native splash until AnimatedSplash explicitly hides it.
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
