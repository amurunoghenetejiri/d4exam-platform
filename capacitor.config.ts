import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config
 *
 * Live server: the Android WebView loads production Vercel so web deploys
 * appear without reinstalling the APK. Native plugins (push, camera, status bar)
 * still run inside the shell.
 *
 * When offline, Capacitor serves errorPath from the APK-bundled assets
 * (must be relative, no leading slash).
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    url: "https://d4exam-platform.vercel.app",
    androidScheme: "https",
    allowNavigation: [
      "d4exam-platform.vercel.app",
      "*.vercel.app",
      "*.supabase.co",
    ],
    // Relative to webDir / APK assets — NOT a remote URL
    errorPath: "offline.html",
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
