# D4EXAM Capacitor Android

## Identity

| Field | Value |
|--------|--------|
| App name | D4EXAM |
| App ID | `com.d4exam.app` |
| Capacitor | 8.x |
| Web assets | **Bundled** `dist/` (local) — does **not** load Vercel as the shell |

## Architecture

```
ANDROID APK
  → bundled HTML/JS/CSS (webDir: dist)
  → local IndexedDB / SQLite offline cache
  → Supabase (when online)
```

**Not:** APK → Vercel website → Supabase

## Build APK (CI)

1. GitHub → Actions → **Build Android APK** → Run workflow
2. Download artifact **D4EXAM-Android-APK**
3. Install `D4EXAM-debug.apk`

## Local build

```bash
npm install
npm run build:cap    # vite build + prepare dist + generate index.html
npx cap sync android
npx cap open android
# Android Studio → Run / Build APK
```

Or:

```bash
npm run cap:sync
```

## Offline startup

With Wi‑Fi and mobile data **off**:

1. App launches from **local** assets (no Vercel required)
2. Login shell / last session UI can appear
3. Previously synced data loads from local DB
4. Online-only actions (start CBT, submit, approvals) wait until network returns

## Website vs APK

| | Website / PWA (Vercel) | Android APK |
|--|------------------------|-------------|
| UI host | Vercel | **Bundled in APK** |
| Data | Supabase | Local cache + Supabase when online |
| Push | Browser FCM | Capacitor + FCM |
| Camera | Browser | Native + WebView |

Deploying the website to Vercel does **not** change the APK UI until you rebuild the APK with `build:cap` / CI.

## Firebase (optional)

Secret `FIREBASE_GOOGLE_SERVICES_JSON` enables native FCM. Without it the APK still builds.
