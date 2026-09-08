# D4EXAM — Website vs Native App

## Products

| | **D4EXAM Website** | **D4EXAM App (APK)** |
|---|---|---|
| Hosting | Vercel (SSR + server functions) | Bundled local SPA in APK |
| Runtime URL | `https://d4exam-platform.vercel.app` | `https://localhost` / `capacitor://` assets from `webDir: dist` |
| Build | `npm run build` (TanStack Start) | `npm run build:app` → `scripts/prepare-capacitor-dist.mjs` |
| Capacitor `server.url` | N/A | **Not set** (must never point at Vercel) |
| Backend | Supabase + Vercel server functions | Supabase client only (VITE_ keys); server fns stubbed |
| Offline | Normal web offline | `offline.html` reloads local `./index.html` |

## Architecture (App)

1. **No `server.url`** in `capacitor.config.ts` / `capacitor.config.json`.
2. `webDir: "dist"` — Capacitor loads the SPA produced by `prepare-capacitor-dist.mjs`.
3. `vite.capacitor.config.ts` + stub map for `.server` / `.functions` modules so the client bundle does not pull SSR code.
4. Entry: `src/capacitor-main.tsx` → `dist-capacitor/capacitor-app.js` → copied into `dist/assets/` + `dist/index.html`.
5. Supabase uses public `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` only (never service role).
6. Native plugins retained: Camera, Push, Local Notifications, Splash, StatusBar, ScreenShare, ExamImmersive.

## Build commands

```bash
# Website (unchanged)
npm run build
# deploy via Vercel as usual

# Native App SPA + sync
npm run build:app          # prepare-capacitor-dist only
npm run cap:sync           # prepare + cap sync android
npm run cap:open           # Android Studio
```

In Android Studio: **Build → Build Bundle(s) / APK(s)** or assembleDebug.

## CI

`.github/workflows/build-android.yml` runs `prepare-capacitor-dist.mjs`, verifies **no** `server.url` and that `dist/index.html` exists, then `cap sync` + Gradle assemble.

## Safety

- Website routing, auth, schema, RLS, and Vercel deployment are untouched.
- App does not load the Website at runtime.
- Database / schema is not modified by this split.
