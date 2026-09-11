Place the release APK here as: d4exam.apk

Or set apkUrl in /public/app-version.json to a GitHub Release URL, e.g.
https://github.com/amurunoghenetejiri/d4exam-platform/releases/latest/download/d4exam.apk

When you ship a new APK:
1. Bump versionCode / versionName in android/app/build.gradle
2. Update minVersion, latestVersion, minBuild, latestBuild in public/app-version.json
3. Upload the new APK to apkUrl
