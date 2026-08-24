import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config — LOCAL web assets (full offline student shell)
 *
 * The APK loads the built SPA from webDir (dist), NOT from Vercel.
 * That means:
 * - Cold start works offline (no "Webpage not available")
 * - Student dashboard / pages use IndexedDB cache when offline
 * - Writing an exam still needs Internet (assertOnline gate)
 * - Login and live data still use Supabase when online
 *
 * StatusBar.overlaysWebView MUST be false so content is not clipped.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    // Local assets only — do NOT set url (that forced remote Vercel and broke offline).
    androidScheme: "https",
    hostname: "localhost",
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
      launchShowDuration: 2200,
      launchAutoHide: true,
      backgroundColor: "#0b1b3a",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b1b3a",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
