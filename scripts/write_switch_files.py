from pathlib import Path
import base64, zlib
b = Path("scripts/account_switcher_z0.b64").read_text().strip() + Path("scripts/account_switcher_z1.b64").read_text().strip()
raw = zlib.decompress(base64.b64decode(b))
Path("src/lib/account-switcher.ts").write_bytes(raw)
assert b"beginReauthForAccount" in raw
c = Path("scripts/switch_card_z.b64").read_text().strip()
raw2 = zlib.decompress(base64.b64decode(c))
Path("src/components/settings/SwitchAccountCard.tsx").write_bytes(raw2)
print("ok", len(raw), len(raw2))
