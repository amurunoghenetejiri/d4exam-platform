# D4EXAM Capacitor Android Setup

## What was done

- Installed `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (v8.5.0)
- Verified `capacitor.config.ts` (appId: `com.d4exam.app`, appName: `D4EXAM`, webDir: `dist`)
- Generated full `android/` Gradle project via `npx cap add android`
- Added permissions for INTERNET, NETWORK_STATE, CAMERA, POST_NOTIFICATIONS
- Preserved existing web UI/UX, auth, Supabase, notifications, CBT

## After clone / pull

```bash
npm install
npm run build
# Create dist for Capacitor webDir (TanStack Start outputs to .output/public)
mkdir -p dist && cp -r .output/public/* dist/
# Optional minimal index if missing
npx cap sync android
npx cap open android
```

## Optional: load live site in WebView

In `capacitor.config.ts`, uncomment:

```ts
server: {
  url: "https://d4exam-platform.vercel.app",
  androidScheme: "https",
},
```

This is recommended for full SSR / auth / CBT until a static client export is used.

## Icons / splash

Default Capacitor launcher icons are present. Replace mipmaps with D4EXAM logo in Android Studio (Image Asset Studio) using `public/logo.png` / `icon-512.png`.

Splash background is already `#070D1B` (matches brand).

## Build APK

Open in Android Studio → Build → Build Bundle(s) / APK(s).
Requires Android SDK / JDK 21.

## Notes

- PWA remains fully functional on web.
- No database, UI, routes, auth, or notification architecture changes.
- No secrets were committed.
