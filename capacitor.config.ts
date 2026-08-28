import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config
 *
 * Live server.url is REQUIRED: TanStack Start is SSR. Loading only local assets
 * causes a blank navy/blue screen after splash. The working product loads the
 * production Vercel app inside the native shell (push, camera, status bar still work).
 *
 * When offline, errorPath shows the bundled offline page (not Chrome error).
 * StatusBar.overlaysWebView MUST be false so content is not clipped under the bar.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    url: "https://d4exam-platform.vercel.app",
    androidScheme: "https",
    errorPath: "offline.html",
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
      // Native layer is ONLY a brief solid theme bridge (never the logo-only stuck screen).
      // Branded AnimatedSplash in the WebView owns the real 9s experience.
      // launchAutoHide MUST be true so the logo splash can never hang forever.
      launchShowDuration: 1500,
      launchAutoHide: true,
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
