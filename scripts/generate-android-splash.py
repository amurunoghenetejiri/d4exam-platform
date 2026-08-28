#!/usr/bin/env python3
"""
Generate D4EXAM native Android splash drawables.

System / Capacitor launch layer is solid app-theme navy (#0b1b3a) only.
No centered logo icon — the real branded splash is AnimatedSplash in the WebView.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    print("Pillow required", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
B64 = ROOT / "scripts" / "assets" / "splash-screen.b64"
FALLBACK_LOGO = ROOT / "public" / "logo.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# App theme navy (#0b1b3a)
NAVY = (11, 27, 58, 255)


def load_master() -> Image.Image:
    if B64.is_file():
        raw = base64.b64decode(B64.read_text().strip())
        from io import BytesIO

        return Image.open(BytesIO(raw)).convert("RGBA")
    if FALLBACK_LOGO.is_file():
        return Image.new("RGBA", (1080, 1920), NAVY)
    raise SystemExit("No splash source (scripts/assets/splash-screen.b64 or public/logo.png)")


def logo_icon(im: Image.Image, size: int) -> Image.Image:
    """Solid app-theme square — Android 12+ system icon blends into navy (no centered logo)."""
    return Image.new("RGBA", (size, size), NAVY)


def write_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=True)


def main() -> None:
    master = load_master()
    print("master", master.size, "theme navy solid splash")

    densities = {
        "drawable-mdpi": (320, 480),
        "drawable-hdpi": (480, 800),
        "drawable-xhdpi": (720, 1280),
        "drawable-xxhdpi": (1080, 1920),
        "drawable-xxxhdpi": (1440, 2560),
    }
    for folder, (tw, th) in densities.items():
        write_png(Image.new("RGBA", (tw, th), NAVY), RES / folder / "splash.png")

    write_png(Image.new("RGBA", (1080, 1920), NAVY), RES / "drawable" / "splash.png")

    for folder, px in [
        ("drawable-mdpi", 144),
        ("drawable-hdpi", 192),
        ("drawable-xhdpi", 288),
        ("drawable-xxhdpi", 384),
        ("drawable-xxxhdpi", 432),
    ]:
        write_png(logo_icon(master, px), RES / folder / "splash_icon.png")
    write_png(logo_icon(master, 288), RES / "drawable" / "splash_icon.png")

    # Keep blank XML shapes for Theme.SplashScreen (native-android overlay)
    (RES / "drawable").mkdir(parents=True, exist_ok=True)
    blank = """<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/splash_background" />
</shape>
"""
    (RES / "drawable" / "splash_blank.xml").write_text(blank, encoding="utf-8")

    print("Splash drawables written under", RES)


if __name__ == "__main__":
    main()
