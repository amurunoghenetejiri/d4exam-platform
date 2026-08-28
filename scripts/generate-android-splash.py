#!/usr/bin/env python3
"""
Generate D4EXAM native Android splash drawables.

System / Capacitor launch layer is solid app-theme navy (#0b1b3a) only.
No centered logo icon — the real branded splash is AnimatedSplash in the WebView.

IMPORTANT: do NOT write drawable/splash.png when drawable/splash.xml exists
(native-android overlay). Android fails the build with Duplicate resources.
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow required", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# App theme navy (#0b1b3a)
NAVY = (11, 27, 58, 255)


def write_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=True)


def main() -> None:
    print("theme navy solid splash assets (no logo icon)")

    drawable = RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)

    # Solid XML shapes — preferred (no PNG conflict)
    solid_xml = """<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/splash_background" />
</shape>
"""
    (drawable / "splash.xml").write_text(solid_xml, encoding="utf-8")
    (drawable / "splash_blank.xml").write_text(solid_xml, encoding="utf-8")

    # Remove any PNG that would conflict with splash.xml / splash_blank.xml
    for name in ("splash.png", "splash_blank.png"):
        p = drawable / name
        if p.is_file():
            p.unlink()
            print("removed conflicting", p)

    # Density-specific solid PNGs are OK (different resource folders than drawable/)
    # but not required when XML exists — skip to keep build simple.
    for folder in (
        "drawable-mdpi",
        "drawable-hdpi",
        "drawable-xhdpi",
        "drawable-xxhdpi",
        "drawable-xxxhdpi",
    ):
        d = RES / folder
        if d.is_dir():
            for name in ("splash.png",):
                p = d / name
                if p.is_file():
                    p.unlink()
                    print("removed", p)

    # Android 12+ animated icon: solid navy PNG (blends into background)
    for folder, px in [
        ("drawable-mdpi", 144),
        ("drawable-hdpi", 192),
        ("drawable-xhdpi", 288),
        ("drawable-xxhdpi", 384),
        ("drawable-xxxhdpi", 432),
    ]:
        write_png(Image.new("RGBA", (px, px), NAVY), RES / folder / "splash_icon.png")
    write_png(Image.new("RGBA", (288, 288), NAVY), drawable / "splash_icon.png")

    print("Splash drawables written under", RES)


if __name__ == "__main__":
    main()
