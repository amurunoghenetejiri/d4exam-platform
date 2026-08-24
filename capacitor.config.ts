import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config
 *
 * Live server: Android WebView loads production Vercel so the full SSR app UI
 * works. Native plugins (push, camera, status bar) still run in the shell.
 *
 * When offline, Capacitor serves errorPath from APK-bundled assets.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    // Live production app — required for TanStack Start SSR UI to render.
    url: "https://d4exam-platform.vercel.app",
    androidScheme: "https",
    // Bundled fallback when the device cannot reach Vercel (offline).
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
