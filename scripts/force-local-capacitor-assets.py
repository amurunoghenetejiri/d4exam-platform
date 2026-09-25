#!/usr/bin/env python3
"""
Force Capacitor Android assets to use the LOCAL bundled SPA (webDir=dist).

CRITICAL: Must NOT set server.url to d4exam.name.ng / Vercel.
When server.url is remote, the APK is only a browser shell:
  - feels like a website
  - native plugins (fingerprint, notifications, MediaProjection screen share) break
  - offline mode does not work

Correct APK model:
  APK → local dist/assets → Capacitor bridge → native plugins → Supabase (online)
  Offline: local UI + cached data still open.
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
CFG = ROOT / "android" / "app" / "src" / "main" / "assets" / "capacitor.config.json"


def main() -> int:
    if not CFG.exists():
        print("WARN: no assets capacitor.config.json yet (run cap sync first)")
        return 0

    d = json.loads(CFG.read_text(encoding="utf-8"))
    server = dict(d.get("server") or {})

    # Strip remote shell URL if any build step injected it
    if "url" in server:
        print("REMOVED remote server.url =", server.get("url"))
        del server["url"]

    server["androidScheme"] = "https"
    server["hostname"] = "localhost"
    server["cleartext"] = False
    server["errorPath"] = "index.html"
    server["allowNavigation"] = [
        "*.supabase.co",
        "*.googleapis.com",
        "*.gstatic.com",
        "*.firebaseio.com",
        "*.firebasestorage.app",
        "*.firebaseapp.com",
        "localhost",
    ]

    d["server"] = server
    d["webDir"] = "dist"
    d["appId"] = d.get("appId") or "com.d4exam.app"
    d["appName"] = d.get("appName") or "D4EXAM"

    CFG.write_text(json.dumps(d, indent=2) + "\n", encoding="utf-8")
    print("OK: local Capacitor shell (no server.url, hostname=localhost)")
    print(json.dumps(d.get("server"), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
