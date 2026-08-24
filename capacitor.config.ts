import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor — TRUE offline-first native shell.
 *
 * CRITICAL: Do NOT set server.url. The WebView must load from LOCALLY BUNDLED
 * assets in the APK (webDir: dist). Remote URL makes offline impossible.
 *
 * Web/browser users still use Vercel. Native uses this local shell only.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    androidScheme: "https",
    hostname: "localhost",
    // No errorPath — broken errorPath caused https://localhost//offline.html
    // Chrome "Webpage not available". Local index.html is the only entry.
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
