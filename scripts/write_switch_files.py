from pathlib import Path
import base64, zlib
b = "".join(Path(f"scripts/as_z_{i}.txt").read_text().strip() for i in range(8))
raw = zlib.decompress(base64.b64decode(b))
Path("src/lib/account-switcher.ts").write_bytes(raw)
assert b"beginReauthForAccount" in raw
b2 = "".join(Path(f"scripts/sc_z_{i}.txt").read_text().strip() for i in range(4))
raw2 = zlib.decompress(base64.b64decode(b2))
Path("src/components/settings/SwitchAccountCard.tsx").write_bytes(raw2)
print("ok", len(raw), len(raw2))
