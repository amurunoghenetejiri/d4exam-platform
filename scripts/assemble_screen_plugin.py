from pathlib import Path
import base64
parts = sorted(Path("scripts/screen_plugin_b64").glob("p*.txt"), key=lambda p: int(p.stem[1:]))
b = "".join(p.read_text().strip() for p in parts)
data = base64.b64decode(b)
assert b"getMediaProjection" in data
assert b"PLACEHOLDER" not in data
assert b"proceeding anyway" not in data
Path("native-android/app/src/main/java/com/d4exam/app/ScreenSharePlugin.java").write_bytes(data)
Path("android/app/src/main/java/com/d4exam/app/ScreenSharePlugin.java").parent.mkdir(parents=True, exist_ok=True)
Path("android/app/src/main/java/com/d4exam/app/ScreenSharePlugin.java").write_bytes(data)
print("assembled", len(data))
