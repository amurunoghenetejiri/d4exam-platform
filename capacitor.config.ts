import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor — production Android loads BUNDLED web assets (webDir: dist).
 * No remote server.url: the app shell starts offline from the APK.
 *
 * Online data (Supabase Auth, API, sync) still uses the network when available.
 * StatusBar.overlaysWebView MUST be false so content is not clipped under the bar.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    // Local assets only — do NOT set `url` (that forced Vercel as the shell).
    androidScheme: "https",
    hostname: "localhost",
    errorPath: "offline.html",
    allowNavigation: [
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
