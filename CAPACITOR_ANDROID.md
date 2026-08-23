# D4EXAM Capacitor Android

## Identity

| Field | Value |
|--------|--------|
| App name | D4EXAM |
| App ID | `com.d4exam.app` |
| Capacitor | 8.5.x |
| webDir | `dist` |
| Server URL | `https://d4exam-platform.vercel.app` (SSR inside WebView) |

## Why server.url is enabled

D4EXAM uses **TanStack Start SSR** (server functions, Supabase session, CBT).  
A static-only WebView would break login and exams. The native shell loads the  
live Vercel site so all existing website features work on Android.

PWA / website on Vercel is unchanged.

## Build APK from your phone (GitHub Actions)

1. Open: https://github.com/amurunoghenetejiri/d4exam-platform/actions
2. Select workflow **Build Android APK**
3. Tap **Run workflow** → branch `main` → **Run workflow**
4. Wait until the run is green (about 5–15 minutes)
5. Open the completed run → **Artifacts** → download **D4EXAM-Android-APK**
6. Unzip if needed → install `D4EXAM-debug.apk` on your phone  
   (allow install from unknown sources if prompted)

This is a **debug** APK — no keystore or signing secrets required.

## Local build (optional, needs desktop)

```bash
npm install
npm run build
mkdir -p dist && cp -r .output/public/* dist/
npx cap add android   # if android/ incomplete
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK path: `android/app/build/outputs/apk/debug/app-debug.apk`

## Future Google Play (release / AAB)

Not required for the debug APK. Later you would add GitHub Secrets such as:

- `ANDROID_KEYSTORE_BASE64` — base64-encoded `.jks` / `.keystore`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Then a separate workflow can run `./gradlew bundleRelease` and upload the `.aab`.

Do **not** commit keystores or passwords to the repo.

## Permissions (Android)

- `INTERNET`
- `ACCESS_NETWORK_STATE`
- `CAMERA` (CBT / PIP)
- `POST_NOTIFICATIONS`

## Notes

- Existing web UI/UX, routes, auth, CBT, notifications, and PWA are preserved.
- No secrets are committed by the Android pipeline.
