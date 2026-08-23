# D4EXAM Capacitor Android

## Identity

| Field | Value |
|--------|--------|
| App name | D4EXAM |
| App ID | `com.d4exam.app` |
| Version | 1.2.0 (versionCode 3) |
| Capacitor | 8.x |
| Server URL | `https://d4exam-platform.vercel.app` |

## Native features

- **Launcher icon** — generated from `public/icon-512.png` / `public/logo.png` in CI
- **Push** — `@capacitor/push-notifications` on Android; web FCM on browser/PWA
- **Camera** — native permission via `@capacitor/camera`, then WebView `getUserMedia` for CBT
- **Microphone** — `RECORD_AUDIO` + runtime `getUserMedia({ audio: true })`
- **Files** — system file picker only (no broad storage permission)

## Build APK (phone)

1. https://github.com/amurunoghenetejiri/d4exam-platform/actions/workflows/build-android.yml
2. **Run workflow** → `main`
3. Download artifact **D4EXAM-Android-APK**
4. Install `D4EXAM-debug.apk` (allow unknown sources)

## Required for full native FCM

1. Firebase Console → Project **d4exam-6506a** → Add Android app `com.d4exam.app`
2. Download `google-services.json`
3. GitHub → Settings → Secrets → Actions → New secret:
   - Name: `FIREBASE_GOOGLE_SERVICES_JSON`
   - Value: full JSON file contents
4. Re-run the Android workflow

Without this secret the APK still builds; native push token registration may be limited until the secret is added.

## Website vs APK

| | Website / PWA | Android APK |
|--|---------------|-------------|
| UI | Unchanged | Same UI in WebView |
| Push | Browser FCM | Capacitor + FCM |
| Camera | Browser permission | Native + WebView |
| Icon | Favicon / PWA | D4EXAM logo mipmaps |

Web changes must be deployed on Vercel for the APK WebView to pick them up (APK loads the live site).
