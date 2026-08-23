import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D4EXAM Capacitor config
 *
 * App identity:
 *   appName  = D4EXAM
 *   appId    = com.d4exam.app
 *
 * Web assets:
 *   webDir = dist  (populate with: npm run build && copy .output/public → dist, or npm run cap:sync)
 *
 * For full SSR/auth/CBT inside the WebView against production, uncomment server.url.
 * Leave it commented to load local static assets from dist/.
 */
const config: CapacitorConfig = {
  appId: "com.d4exam.app",
  appName: "D4EXAM",
  webDir: "dist",
  server: {
    // Uncomment to load the live Vercel deployment inside the Android WebView
    // (recommended for TanStack Start SSR until a fully static client export is used):
    // url: "https://d4exam-platform.vercel.app",
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#070D1B",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
