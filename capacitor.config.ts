import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config — offline-first native shell.
 *
 * The Android WebView loads the app from LOCALLY BUNDLED assets (webDir: dist).
 * It does NOT depend on Vercel to render the UI. Supabase APIs are still used
 * when the device is online.
 *
 * Web (browser) continues to use the Vercel deployment separately.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    // Local asset scheme — never point at a remote host for the main shell.
    androidScheme: "https",
    // Hostname for the local bridge (Capacitor serves bundled files here).
    hostname: "localhost",
    // Last-resort static page if the WebView cannot load index (bundled in APK).
    // Relative path, no leading slash — must exist under webDir / APK assets.
    errorPath: "offline.html",
    allowNavigation: [
      "d4exam-platform.vercel.app",
      "*.vercel.app",
      "*.supabase.co",
      "*.googleapis.com",
      "*.gstatic.com",
      "*.firebaseio.com",
      "*.firebasestorage.app",
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0b1b3a",
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2800,
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
