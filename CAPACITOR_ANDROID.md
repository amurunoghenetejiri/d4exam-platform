# D4EXAM — Website vs Native App

## Two products, one codebase

| | **Website** | **App (APK)** |
|---|---|---|
| **What users open** | Browser → `https://d4exam-platform.vercel.app` | Install APK on Android phone |
| **Hosting** | Vercel (SSR + server functions) | Files baked into the APK (`dist/`) |
| **Build command** | `bun run build` (or Vercel auto) | `bun run build:app` → `prepare-capacitor-dist.mjs` |
| **Capacitor `server.url`** | N/A | **Never set** (must not point at Vercel) |
| **Backend** | Supabase + Vercel server functions | Supabase client only (`VITE_` keys); server fns stubbed |
| **Offline** | Normal browser offline | `offline.html` reloads local `./index.html` |

They share UI, routes, components, and Supabase schema.  
They do **not** share runtime: the App never loads the Website URL.

---

## How the App loads (no Vercel)

1. `bun run build:app` runs `scripts/prepare-capacitor-dist.mjs`
2. That stubs server modules, builds client SPA with `vite.capacitor.config.ts`
3. Writes `dist/index.html` + `dist/assets/capacitor-app.js`
4. Capacitor `webDir: "dist"` → WebView loads **local** assets only
5. Supabase is called directly from the phone (needs network for auth/data)

---

## How to get / update the **Website**

1. Push any change to `main` (or your Vercel-connected branch).
2. Vercel builds and deploys automatically.
3. Open: **https://d4exam-platform.vercel.app**

No extra steps. Website deploy is independent of the APK.

---

## How to get / update the **App (APK)**

### Option A — GitHub Actions (recommended)

1. Go to the repo → **Actions** → **Build Android APK (local SPA)**
2. Click **Run workflow** → **Run workflow**
3. When it finishes (green), open the run → **Artifacts** → download **d4exam-debug-apk**
4. Unzip → install the `.apk` on your phone (enable “Install from unknown sources” if needed)

**Required secrets** (Settings → Secrets and variables → Actions):

| Secret name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` | Your anon/public key |

Without these, the SPA builds but cannot talk to Supabase until you rebuild with keys.

### Option B — Local machine

```bash
# Install deps once
bun install

# Build local SPA + copy into Android project
bun run cap:sync

# Open Android Studio
bun run cap:open
```

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
Or: `cd android && ./gradlew assembleDebug`

APK path: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Is updating easy?

| What you change | Website | App |
|---|---|---|
| UI, pages, styles, client logic | Push → Vercel auto-deploys | Rebuild APK (`cap:sync` or CI) + reinstall |
| Server functions / SSR only | Push → Vercel | No effect (stubs in App) |
| Supabase schema / RLS | Apply migration (shared) | Shared — both see new schema |
| Native plugins / AndroidManifest | N/A | Rebuild APK |

**Rule of thumb**

- Everyday product changes → push once; **Website updates automatically**.
- **App** needs a new APK build + install when you change code that ships inside the bundle (UI, client logic, native plugins).
- Database changes apply to both as soon as you migrate Supabase.

There is no “hot update” of the APK from Vercel. Each release is a new APK (or you can later add Capacitor Live Updates / CodePush if you want OTA).

---

## Scripts (package.json)

```bash
bun run build          # Website (TanStack Start)
bun run build:app      # App SPA only → dist/
bun run cap:sync       # prepare-capacitor-dist + cap sync android
bun run cap:open       # Android Studio
```

---

## Safety checks

- `capacitor.config.ts` has **no** `server.url`
- CI fails if a remote URL is reintroduced
- Website routing, auth, schema, RLS, and Vercel deploy are untouched by App builds
- App uses only public `VITE_` Supabase keys (never service role)
