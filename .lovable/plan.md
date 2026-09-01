# D4EXAM Offline-First Implementation Plan

Based on inspection of the current code. No Supabase changes: same project, same env vars, same auth/RLS/tables/RPCs/Realtime. No UI redesign, no route or permission changes.

## What already exists (reused, not duplicated)

- `src/lib/offline-cache.ts` — IndexedDB store `d4exam-offline-v1`, per-user scoped keys (`userId::key`).
- `src/lib/offline-query.ts` — local-first read hook (cache → render → refresh when online).
- `src/lib/local-db/*` — SQLite (`@capacitor-community/sqlite`, already installed) on native, memory fallback on web; schema, outbox, mirror helpers.
- `src/lib/sync/*` — connectivity resolver, push (outbox), scoped pull, status snapshot, retry/backoff; orchestrated by `runSyncEngine`.
- `src/lib/offline-sync.ts` + `src/components/OfflineBootstrap.tsx` — reconnect/visibility-driven sync, already mounted in `__root.tsx`.
- `src/components/OfflineStatusPill.tsx`, `NetworkBanner.tsx`, `OfflineEmptyState.tsx`, `LocalDbBootstrap.tsx` — existing status UI.
- `src/lib/offline-guard.ts` / `require-online.ts` — online-only action guards.
- `scripts/prepare-capacitor-dist.mjs` + `vite.capacitor.config.ts` + `src/capacitor-main.tsx` — an existing bundled SPA shell build for Android (server-module stubs, own Vite build to `dist-capacitor`, generated `index.html`).

## Root problem found

`capacitor.config.ts` (and the copied `android/app/src/main/assets/capacitor.config.json`) sets `server.url = https://d4exam-platform.vercel.app`. The native app therefore loads the whole website over the network, so **nothing** works without Internet — the existing offline stack never gets a chance to run. The bundled shell built by `prepare-capacitor-dist.mjs` is currently unused.

Second problem: `src/lib/face-detector.ts` loads MediaPipe WASM from jsdelivr and the BlazeFace `.tflite` from `storage.googleapis.com` at runtime → face monitoring fails offline and on locked-down networks.

## Changes to make

### 1. Native shell loads bundled assets (offline-capable), website untouched
- Drop `server.url` from the native config and load the local bundle; keep `androidScheme: "https"`, `errorPath`, splash/status-bar/push/notification plugin blocks, and `allowNavigation` for Supabase/Firebase/Vercel hosts so online services still work.
- Make `prepare-capacitor-dist.mjs` the official native build path: add an npm script (`cap:build` → prepare dist → `cap sync android`) so the bundled SPA in `dist/` is what ships. `vite.config.ts`, SSR, `src/server.ts` and the Vercel deployment are not touched — the website keeps SSR exactly as today.
- Verify the SPA entry (`src/capacitor-main.tsx`) boots the router without server functions; extend the stub map only where a real client fallback is needed (e.g. login must use the existing `resolve_login_identity` RPC path via the browser Supabase client rather than a stubbed server fn).

### 2. Offline navigation + retained data
- Route-level: keep the current router error/pending components; ensure student/staff shell routes render from cache instead of throwing when `beforeLoad` guards can't reach the network — guards fall back to the locally stored session (`local-db` session repo + `readLastUserId`).
- Extend the existing `mirror.ts` scopes so profile, notifications, results/history, courses and examination metadata are written on every successful online read (via `offline-query`) and read back on cold start.
- Persistence across restarts uses SQLite on native (already wired) with IndexedDB as web/browser fallback; both are keyed by `userId`, and sign-out/user-switch clears the other user's scope (user isolation preserved).

### 3. Online/offline status
- Reuse `OfflineStatusPill` / `NetworkBanner` fed by `subscribeSyncStatus` + `resolveConnectivity`; no new UI components, no layout change.

### 4. Face monitoring offline
- Add `@mediapipe/tasks-vision` WASM files and the `blaze_face_short_range.tflite` model to `public/` (copied at build time from the already-installed npm package / vendored model file), and point `WASM_BASE` / `MODEL_URL` in `face-detector.ts` at those local paths with the current remote URLs kept only as a last-resort fallback. Native `FaceDetector` preference and all detection/NMS logic and UI stay exactly as-is.

### 5. CBT stays online-only
- `ExamSecurityGate` already calls `assertOnlineActionSync()`; upgrade that call site to the async `assertOnlineAction()` (real reachability probe, not just `navigator.onLine`) and set the message to exactly: “Internet connection is required to start and write this examination.”
- Apply the same guard on the examinations list "Start" entry point (`src/routes/student.examinations.tsx` already imports `assertOnline`) and keep the in-exam behaviour unchanged.
- Live camera publish, screen share, officer monitoring, integrity/tab events, submissions, result processing, notifications and Realtime remain online-only — no offline queueing added for any of them.

## Files expected to change

- `capacitor.config.ts`, `android/app/src/main/assets/capacitor.config.json`
- `package.json` (native build script only)
- `scripts/prepare-capacitor-dist.mjs`, `vite.capacitor.config.ts` (asset copy + stub fixes)
- `src/lib/face-detector.ts` (+ new `public/mediapipe/*` assets)
- `src/components/cbt/ExamSecurityGate.tsx`, `src/routes/student.examinations.tsx` (online gate message)
- `src/lib/guard.ts`, `src/lib/session.ts` (offline session fallback)
- `src/lib/local-db/mirror.ts`, `src/lib/sync/pull.ts`, `src/lib/offline-query.ts` (scope coverage for profile/notifications/results/courses/exams)

## Preserving the Supabase connection

- No migration, no reset, no new project. `src/integrations/supabase/*` and `.env` values stay untouched.
- Native app talks to the same Supabase URL + publishable key over HTTPS when online; offline reads come from the local mirror only.
- RLS still enforces isolation server-side; local storage is additionally partitioned by `userId`.

## Verification

- Android bundled build boots with airplane mode: splash → cached dashboard, navigation across cached pages, data present after restart.
- Start Exam offline shows the required message and does not enter the exam; online CBT flow (camera, screen share, officer monitor, submit) unchanged.
- Website build (`vite build`) and Vercel SSR unaffected.
