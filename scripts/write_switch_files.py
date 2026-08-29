from pathlib import Path
import base64, zlib
pairs = [
    ("scripts/account_switcher_z.b64", "src/lib/account-switcher.ts"),
    ("scripts/switch_card_z.b64", "src/components/settings/SwitchAccountCard.tsx"),
]
for src, dest in pairs:
    raw = zlib.decompress(base64.b64decode(Path(src).read_text().strip()))
    Path(dest).write_bytes(raw)
    print("wrote", dest, len(raw))
assert "beginReauthForAccount" in Path("src/lib/account-switcher.ts").read_text()
print("ok")
