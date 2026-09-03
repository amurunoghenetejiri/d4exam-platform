# D4EXAM Capacitor Android (offline-first)

## Identity

| Field | Value |
|--------|--------|
| App name | D4EXAM |
| App ID | `com.d4exam.app` |
| Capacitor | 8.x |
| Web assets | Bundled SPA in `dist/` (built by `prepare-capacitor-dist.mjs`) |
| Remote shell | **Disabled by default** (no `server.url`) |

## Offline-first model

1. **APK loads local UI** from packaged `dist/` (not Vercel).
2. **Auth / first login** still needs internet (Supabase).
3. **After login online once**, React Query offline cache + local DB can serve lists when the network drops.
4. **Exam start / submit / live monitor / approvals** still require internet (integrity).

Optional remote debug (developers only):

```bash
CAP_REMOTE_URL=1 npx cap sync android
# or
CAP_SERVER_URL=https://d4exam-platform.vercel.app npx cap sync android
```

Production APKs must **not** set `CAP_REMOTE_URL`.

## Build APK

1. GitHub Actions → `build-android.yml` → Run on `main`
2. Download **D4EXAM-Android-APK**
3. Install (allow unknown sources)

Local:

```bash
npm run build:cap
npx cap sync android
npx cap open android
```

## Website vs APK

| | Website (Vercel) | Android APK |
|--|------------------|-------------|
| UI source | SSR / Vercel | Bundled SPA in the APK |
| Offline boot | Browser cache only | Local `dist/` always boots |
| Login | Online | Online required |
| Cached screens | Partial | Partial (after online use) |
| Push / camera | Browser | Capacitor plugins |

Website deploys still go through Vercel for the browser. The APK no longer depends on Vercel to open the app shell.
