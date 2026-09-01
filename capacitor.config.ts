import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config — OFFLINE-FIRST native shell.
 *
 * The native app loads the bundled SPA shell built by
 * `npm run cap:build` (scripts/prepare-capacitor-dist.mjs → dist/),
 * so it launches and navigates cached pages with no Internet.
 *
 * There is intentionally NO `server.url`: pointing the WebView at the
 * Vercel site made every launch require connectivity. The Vercel/SSR
 * website build is untouched — online services (Supabase Auth/Data/
 * Realtime, storage, push, officer monitoring) are still reached over
 * HTTPS from the bundled shell whenever the device is online.
 *
 * Splash: launchAutoHide=false so native solid theme stays until
 * AnimatedSplash paints the branded experience.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
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
      // Hold native splash until AnimatedSplash explicitly hides it.
      // Prevents the navy blank gap while the remote WebView boots.
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
