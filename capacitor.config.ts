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
    backgroundColor: "#00081D",
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // Held until AnimatedSplash paints and later dismisses (min 9s + app ready).
      launchShowDuration: 9000,
      launchAutoHide: false,
      backgroundColor: "#00081D",
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
