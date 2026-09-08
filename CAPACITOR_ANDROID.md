# D4EXAM — Website vs Native App

## Same Supabase for both products

**You do not create a second Supabase project.**

| Product | How it talks to Supabase |
|---|---|
| **Website** | Vercel + client (`VITE_SUPABASE_*`) + server keys on Vercel |
| **App (APK)** | Client only — same `VITE_SUPABASE_URL` + same anon/publishable key |

Same database, same tables, same RLS, same users, same exams.  
The App never uses the service role key (that stays on Vercel only).

Set these **once** in GitHub Actions secrets (same values as your Website / `.env`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`

If secrets are empty, the build still works when `.env` is present in the repo (Vite loads it).

---

## Two products, one codebase

| | **Website** | **App (APK)** |
|---|---|---|
| **Users open** | Browser → Vercel URL | Install APK on Android |
| **UI / assets** | Served by Vercel (SSR) | **Bundled inside the APK** (`dist/`) — no Vercel at runtime |
| **Backend** | Same Supabase | Same Supabase |
| **Offline shell** | Browser cache | App opens from disk; `offline.html` if a remote resource fails |
| **Needs network** | Yes for data | Yes for login, live exams, push, new data. Shell UI loads offline. |

The App is **not** a second website. It is a native shell that loads a **local SPA**. It does **not** open `d4exam-platform.vercel.app`.

---

## Offline behaviour (App)

What works **without** internet:

- App opens (splash → local `index.html` → SPA from `dist/`)
- UI chrome, routes that do not need live data
- `offline.html` if something remote fails → **Retry** reloads local `./index.html` (not Vercel)

What still needs internet (same Supabase):

- Login / session refresh
- Fetching exams, materials, live monitoring
- Push notifications
- Submitting answers / new writes

That is expected: one shared live database. Full offline exam cache can be extended later with the existing SQLite plugin; the shell is already local.

---

## How to get the Website

1. Push to `main`
2. Vercel deploys automatically
3. Open your Vercel URL

---

## How to get the App (APK)

### GitHub Actions

1. **Actions** → **Build Android APK (local SPA)** → **Run workflow**
2. When green → **Artifacts** → download **d4exam-debug-apk**
3. Install the `.apk` on the phone

### Local

```bash
bun install
bun run cap:sync
bun run cap:open
# Android Studio → Build APK
# or: cd android && ./gradlew assembleDebug
```

---

## Updating

| Change | Website | App |
|---|---|---|
| UI / client code | Push → live on Vercel | Rebuild APK + reinstall |
| Supabase schema / RLS | One migration | Both products see it |
| Native plugins | N/A | Rebuild APK |

Day-to-day product work: push once → Website updates.  
New APK only when you want a new native install.

---

## Scripts

```bash
bun run build       # Website (TanStack Start / Vercel)
bun run build:app   # App SPA only → dist/
bun run cap:sync    # prepare-capacitor-dist + cap sync android
bun run cap:open    # Android Studio
```

## Safety

- No `server.url` in Capacitor config (App never loads Vercel)
- CI fails if a remote URL is reintroduced
- Website and schema are not changed by App builds
