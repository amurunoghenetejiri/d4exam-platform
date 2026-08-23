# D4EXAM — Web App, PWA & Capacitor readiness

## Current stack (preserved)

| Layer | Technology |
|--------|------------|
| UI | React 19 + TanStack Start / Router |
| Data | TanStack Query |
| Backend | Supabase (Postgres, Auth, RLS, Realtime) |
| Auth | Supabase Auth (`auth.users` + `profiles` / `user_roles`) |
| Push | Firebase Cloud Messaging (web) |
| Hosting | Vercel (typical) |
| Styling | Tailwind CSS 4 |

D4EXAM is an **examination / CBT platform**, not a fintech wallet. Existing exam, role, and notification flows remain the source of truth.

## What was added (non-breaking)

1. **`src/native/`** — platform abstractions with **web fallbacks**:
   - `platform.ts` — web / PWA / future Capacitor detection
   - `networkService.ts` — online/offline
   - `storageService.ts` — key-value storage
   - `notificationService.ts` — wraps existing FCM registration
   - `cameraService.ts` — `getUserMedia` for future native camera swap
2. **`capacitor.config.ts`** — template only (no native build required now)
3. **PWA** — `site.webmanifest`, icons, FCM service worker + offline shell / `offline.html`
4. **`NetworkBanner`** — optional offline strip (safe to mount in shell later)
5. **`.env.example`** — public vs server secrets

## Web application behaviour (already in product)

- Mobile-first layouts, bottom nav on student (and similar) portals via `AppShell`
- Protected routes / role guards
- Persistent Supabase sessions
- Toasts (Sonner), dialogs (Radix), loading via Query
- Installable PWA (`display: standalone`)
- Push notifications (FCM) when enabled on device

## Environment variables

See `.env.example`.

**Never** put `SUPABASE_SERVICE_ROLE_KEY` or Firebase private keys in client bundles.

## PWA install

1. Open the site on Android Chrome (HTTPS).
2. Browser **Install app** dialog, or Chrome menu → Install app.
3. Open from home screen for app-like chrome (no browser URL bar).

## Future Capacitor (when you have a laptop)

You do **not** need to do this now.

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "D4EXAM" "com.d4exam.app" --web-dir dist
# capacitor.config.ts already exists — align appId/appName if prompted
npm run build
npx cap add android
npx cap add ios
npx cap sync
```

Then open Android Studio / Xcode only when available:

- Android: `npx cap open android`
- iOS: `npx cap open ios` (macOS only)

### Recommended plugins later

| Need | Package |
|------|---------|
| Push | `@capacitor/push-notifications` |
| Network | `@capacitor/network` |
| Preferences | `@capacitor/preferences` |
| Camera | `@capacitor/camera` |
| Status bar / splash | `@capacitor/status-bar`, `@capacitor/splash-screen` |

Swap implementations inside `src/native/*` only — keep screens calling the abstraction.

### Icons & splash (later)

- Web/PWA: `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
- Android adaptive / iOS: generate from the same logo when packaging

## Architecture map

```
src/
  routes/          # file-based screens (login, student, teacher, admin, …)
  components/      # UI (AppShell, CBT, settings, …)
  lib/             # auth, notify, push, queries, session
  native/          # Capacitor-ready device APIs (web fallbacks)
  integrations/    # Supabase client
public/
  site.webmanifest
  firebase-messaging-sw.js   # push + offline shell
  offline.html
capacitor.config.ts          # future native shell
```

## Priority rules used

1. Keep existing exam/auth/notification behaviour working  
2. Database remains source of truth  
3. No secrets in frontend  
4. Mobile / PWA experience  
5. Capacitor readiness without requiring a laptop now  

## Troubleshooting

| Issue | Check |
|-------|--------|
| Install dialog missing | HTTPS, not already installed, Chrome eligibility |
| Push only on website | Enable notifications + `push_devices` row + `FIREBASE_SERVICE_ACCOUNT_JSON` on server |
| Offline page | Service worker registered; hard refresh once after deploy |
