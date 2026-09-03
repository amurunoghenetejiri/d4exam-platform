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

1. **APK loads local UI** from packaged `dist/` (not Vercel). Boots even with no network.
2. **First login** still needs internet (Supabase Auth). After one successful login, the session snapshot is cached (IndexedDB + local SQLite).
3. **While offline after login**, these work from saved data:
   - App shell, menus, navigation
   - Role dashboards (lists previously synced)
   - Exam metadata / schedules
   - Courses & school identity
   - Notifications (read-only)
   - Results previously pulled
   - Profile display
4. **Always require internet** (integrity):
   - Login / password change
   - Start or submit a CBT exam
   - Live monitoring / officer commands
   - Approvals, admin create/edit/delete
   - Push delivery

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

## Sync engine

On reconnect the engine:

1. Pushes pending outbox mutations (when any)
2. Pulls notifications, examination meta, courses, school identity, and student results (role-scoped)
3. Invalidates React Query so screens refresh from local + network

Local storage:

- IndexedDB (`d4exam-offline-v1`) for query envelopes
- SQLite via `@capacitor-community/sqlite` on native (memory fallback on web)

## Website vs APK

| | Website (Vercel) | Android APK |
|--|------------------|-------------|
| UI source | SSR / Vercel | Bundled SPA in the APK |
| Offline boot | Browser cache only | Local `dist/` always boots |
| Login | Online | Online required once |
| Cached screens | Partial | Partial (after online use) |
| Push / camera | Browser | Capacitor plugins |

Website deploys still go through Vercel for the browser. The APK does not depend on Vercel to open the app shell.

## Not yet full offline product

- Offline CBT (download questions + submit later) is intentionally **not** enabled for integrity reasons.
- First install with zero network cannot log in or seed data.
- Staff admin student/teacher lists are best-effort from React Query cache; expand pull scopes further if needed.
