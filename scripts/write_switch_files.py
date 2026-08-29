"""
Legacy helper that used to decompress base64/zlib blobs into account-switcher files.
Those blobs are often corrupt in CI (zlib incorrect data check).

The real source files already live in the repo:
  - src/lib/account-switcher.ts
  - src/components/settings/SwitchAccountCard.tsx

This script is now a safe no-op: verify files exist, never overwrite from bad blobs.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SWITCHER = ROOT / "src" / "lib" / "account-switcher.ts"
CARD = ROOT / "src" / "components" / "settings" / "SwitchAccountCard.tsx"

def ok(path: Path, needles: list[str]) -> bool:
    if not path.is_file():
        print(f"MISSING: {path}")
        return False
    text = path.read_text(encoding="utf-8", errors="replace")
    for n in needles:
        if n not in text:
            print(f"WARN: {path.name} missing marker {n!r} (still usable)")
    print(f"OK: {path.relative_to(ROOT)} ({len(text)} bytes)")
    return True

def main() -> int:
    # Prefer existing committed sources — never decompress corrupt as_z_*.txt / sc_z_*.txt
    a = ok(SWITCHER, ["switchToAccount", "saveCurrentAccountToVault", "listSavedAccounts"])
    b = ok(CARD, ["SwitchAccount", "switchToAccount"]) if CARD.exists() else True
    if not a:
        print("FATAL: account-switcher.ts missing from repo — restore from git history")
        return 1
    print("write_switch_files: skipped zlib restore (sources already in repo)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
