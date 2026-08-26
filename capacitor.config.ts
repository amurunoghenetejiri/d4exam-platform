import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor — production Android loads the live Vercel web app as the shell.
 * This matches the previously working setup (stable UI, no blank blue SPA shell).
 *
 * StatusBar.overlaysWebView MUST be false so content is not clipped under the bar.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    // Live production shell (same as before offline-local experiments)
    url: "https://d4exam-platform.vercel.app",
    cleartext: false,
    androidScheme: "https",
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
