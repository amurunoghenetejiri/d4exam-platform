# D4EXAM — Install & Update APK (exact steps)

Your app is **not** on Play Store. Updates download **your APK** from GitHub Releases.

---

## One-time: build and publish the APK

1. Open GitHub → **Actions**
2. Click workflow **Build Android APK**
3. Click **Run workflow** → branch **main** → **Run workflow**
4. Wait until the job is **green**
5. Open the finished run → **Artifacts** → download **d4exam-debug-apk** (backup copy)
6. The workflow also publishes a Release tag **`apk-latest`** with file **`d4exam.apk`**
7. Public download URL (already set in `app-version.json`):
   `https://github.com/amurunoghenetejiri/d4exam-platform/releases/download/apk-latest/d4exam.apk`

If the Release step fails, upload manually:
- GitHub → **Releases** → create/edit tag `apk-latest` → upload `d4exam.apk`

---

## First install (student / officer phone)

### From the website (Android only)
1. Open `https://d4exam-platform.vercel.app` in **Chrome on Android**
2. Bottom banner: **Install D4EXAM app**
3. Tap **Install app**
4. If Android asks, allow install from Chrome / browser
5. Open the downloaded APK → **Install**
6. Open **D4EXAM** from the app drawer

### Manual
1. Download the APK from the Release URL above
2. Open the file → Install

iPhone: no install button (no iOS app yet).

---

## When you ship a **new** APK (force update)

1. Bump version in `android/app/build.gradle` (or the values the CI template uses):
   - `versionCode` → higher number (2, 3, 4…)
   - `versionName` → e.g. `"1.1.0"`
2. Edit `public/app-version.json` on `main`:
```json
{
  "minVersion": "1.1.0",
  "latestVersion": "1.1.0",
  "minBuild": 2,
  "latestBuild": 2,
  "apkUrl": "https://github.com/amurunoghenetejiri/d4exam-platform/releases/download/apk-latest/d4exam.apk",
  "forceUpdate": true
}
```
3. Push to `main` (Vercel deploys `app-version.json`)
4. **Actions** → **Build Android APK** → **Run workflow** again
5. Confirm Release `apk-latest` has the new `d4exam.apk`

### What the user does
1. Opens the **old** installed D4EXAM app
2. Sees full screen **Update required**
3. Taps **Update app now** → downloads new APK
4. Installs over the old app
5. Opens app again → normal use
6. Optional: **I already updated — check again** after installing

---

## Website-only changes (no APK)

Push to `main` → Vercel deploys → app WebView loads the new site **automatically**.  
No **Update app** button. No new APK.

Rebuild APK only when native shell / plugins / permissions change, or you intentionally raise `minBuild`.

---

## Buttons summary

| Where | Button | Action |
|--------|--------|--------|
| Website (Android) | **Install app** | Download APK |
| Website (Android) | **Not now** | Dismiss banner |
| Installed app (outdated) | **Update app now** | Download new APK |
| Installed app (outdated) | **I already updated — check again** | Re-read version |

---

## Important

- Same **package name** `com.d4exam.app` and preferably same signing key for smooth over-install.
- Debug CI builds use the default debug keystore — fine for testing; for production, add a release keystore later.
- Until the first successful **Build Android APK** + Release, the download link may 404.
