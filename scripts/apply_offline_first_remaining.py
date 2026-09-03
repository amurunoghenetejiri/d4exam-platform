from pathlib import Path

p = Path("src/routes/login.tsx")
t = p.read_text()
if "isDeviceOffline" not in t:
    needle = "function friendlyLoginError(err: unknown): string {"
    helper = (
        "function isDeviceOffline(): boolean {\n"
        "  try {\n"
        "    if (typeof navigator !== \"undefined\" && navigator.onLine === false) return true;\n"
        "  } catch {\n"
        "    /* ignore */\n"
        "  }\n"
        "  return false;\n"
        "}\n\n"
    )
    if needle not in t:
        raise SystemExit("friendlyLoginError missing")
    t = t.replace(needle, helper + needle, 1)
if "You are offline. Connect to the Internet to sign in" not in t:
    old = "  async function submit(e: React.FormEvent) {"
    new = (
        "  async function submit(e: React.FormEvent) {\n"
        "    if (isDeviceOffline()) {\n"
        "      setError(\"You are offline. Connect to the Internet to sign in. After login, many screens work from saved data offline.\");\n"
        "      return;\n"
        "    }"
    )
    if old not in t:
        raise SystemExit("submit handler missing")
    t = t.replace(old, new, 1)
p.write_text(t)
print("login OK", p.stat().st_size)

w = Path(".github/workflows/build-android.yml")
wt2 = w.read_text()
old_verify = (
    '      - name: Verify capacitor uses Vercel shell URL\n'
    '        run: |\n'
    '          set -euo pipefail\n'
    '          CFG="capacitor.config.ts"\n'
    '          grep -q \'d4exam-platform.vercel.app\' "$CFG"\n'
    '          echo "OK: Capacitor server.url points at Vercel production"'
)
new_verify = (
    '      - name: Verify capacitor is offline-first (local webDir, no remote url)\n'
    '        run: |\n'
    '          set -euo pipefail\n'
    '          test -f dist/index.html\n'
    '          test -f capacitor.config.ts\n'
    '          if [ -f capacitor.config.json ] && grep -E \'"url"[[:space:]]*:\' capacitor.config.json; then\n'
    '            echo "ERROR: capacitor.config.json has server.url"\n'
    '            exit 1\n'
    '          fi\n'
    '          echo "OK: Capacitor offline-first local SPA"'
)
if old_verify in wt2:
    wt2 = wt2.replace(old_verify, new_verify, 1)
    print("verify step replaced")
else:
    print("verify block not exact; soft replace")
    wt2 = wt2.replace("Verify capacitor uses Vercel shell URL", "Verify capacitor is offline-first (local webDir, no remote url)")
    wt2 = wt2.replace('grep -q \'d4exam-platform.vercel.app\' "$CFG"', "test -f dist/index.html")
    wt2 = wt2.replace("OK: Capacitor server.url points at Vercel production", "OK: Capacitor offline-first local SPA")

wt2 = wt2.replace(
    "Prepare Capacitor dist (fallback assets; shell is Vercel URL)",
    "Prepare Capacitor offline-first SPA dist",
)
wt2 = wt2.replace(
    "node scripts/prepare-capacitor-dist.mjs || true",
    "node scripts/prepare-capacitor-dist.mjs",
)
wt2 = wt2.replace(
    'echo "dist ready (runtime shell = https://d4exam-platform.vercel.app)"',
    'test -f dist/index.html\n          test -d dist/assets\n          echo "dist ready (offline-first local SPA shell)"',
)
w.write_text(wt2)
print("workflow OK", w.stat().st_size)
if "points at Vercel production" in wt2:
    raise SystemExit("vercel verify still present")
print("ALL_OK")
