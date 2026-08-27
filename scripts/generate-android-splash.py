#!/usr/bin/env python3
"""
Generate D4EXAM native Android splash drawables from the branded splash image.

- Full-screen portrait splash (exact branding) for Capacitor / Theme.SplashScreen
- Centered icon crop for Android 12+ windowSplashScreenAnimatedIcon
- Soft radial glow layer (static; alpha animated by system where supported)

Does NOT redesign the logo — uses the provided splash artwork as-is.
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

# Deep navy from the splash artwork corners
NAVY = (0, 8, 29, 255)


def load_master() -> Image.Image:
    if B64.is_file():
        raw = base64.b64decode(B64.read_text().strip())
        from io import BytesIO

        return Image.open(BytesIO(raw)).convert("RGBA")
    if FALLBACK_LOGO.is_file():
        logo = Image.open(FALLBACK_LOGO).convert("RGBA")
        # Compose a simple navy portrait with centered logo (fallback only)
        tw, th = 1080, 1920
        canvas = Image.new("RGBA", (tw, th), NAVY)
        max_side = int(min(tw, th) * 0.42)
        logo.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        canvas.paste(logo, ((tw - logo.width) // 2, int(th * 0.22) - logo.height // 2), logo)
        return canvas
    raise SystemExit("No splash source (scripts/assets/splash-screen.b64 or public/logo.png)")


def fit_portrait(im: Image.Image, tw: int, th: int) -> Image.Image:
    """Scale image to cover portrait canvas without letterboxing (center-crop)."""
    w, h = im.size
    scale = max(tw / w, th / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    scaled = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return scaled.crop((left, top, left + tw, top + th))


def fit_contain(im: Image.Image, tw: int, th: int, bg=NAVY) -> Image.Image:
    """Scale to fit inside canvas, navy letterbox if needed."""
    w, h = im.size
    scale = min(tw / w, th / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    scaled = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), bg)
    canvas.paste(scaled, ((tw - nw) // 2, (th - nh) // 2), scaled)
    return canvas


def logo_icon(im: Image.Image, size: int) -> Image.Image:
    """Square transparent icon from upper logo region of the splash art."""
    w, h = im.size
    cy = int(h * 0.28)
    cx = w // 2
    side = int(w * 0.72)
    box = (cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)
    crop = im.crop(box)
    crop = crop.resize((size, size), Image.Resampling.LANCZOS)
    return crop


def write_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=True)


def main() -> None:
    master = load_master()
    print("master", master.size)

    densities = {
        "drawable-mdpi": (320, 480),
        "drawable-hdpi": (480, 800),
        "drawable-xhdpi": (720, 1280),
        "drawable-xxhdpi": (1080, 1920),
        "drawable-xxxhdpi": (1440, 2560),
    }
    for folder, (tw, th) in densities.items():
        img = fit_contain(master, tw, th)
        write_png(img, RES / folder / "splash.png")

    write_png(fit_contain(master, 1080, 1920), RES / "drawable" / "splash.png")

    for folder, px in [
        ("drawable-mdpi", 144),
        ("drawable-hdpi", 192),
        ("drawable-xhdpi", 288),
        ("drawable-xxhdpi", 384),
        ("drawable-xxxhdpi", 432),
    ]:
        write_png(logo_icon(master, px), RES / folder / "splash_icon.png")
    write_png(logo_icon(master, 288), RES / "drawable" / "splash_icon.png")

    glow_size = 512
    glow = Image.new("RGBA", (glow_size, glow_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    cx = cy = glow_size // 2
    for i, alpha in enumerate([18, 28, 40, 28, 18]):
        r = int(glow_size * (0.48 - i * 0.06))
        draw.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            fill=(59, 130, 246, alpha),
        )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=28))
    write_png(glow, RES / "drawable" / "splash_glow.png")

    (RES / "drawable").mkdir(parents=True, exist_ok=True)
    (RES / "drawable" / "splash_layer.xml").write_text(
        """<?xml version=\"1.0\" encoding=\"utf-8\"?>
<layer-list xmlns:android=\"http://schemas.android.com/apk/res/android\">
    <item>
        <bitmap
            android:gravity=\"fill\"
            android:src=\"@drawable/splash\"
            android:antialias=\"true\" />
    </item>
</layer-list>
""",
        encoding="utf-8",
    )

    (RES / "drawable" / "splash_ring.xml").write_text(
        """<?xml version=\"1.0\" encoding=\"utf-8\"?>
<shape xmlns:android=\"http://schemas.android.com/apk/res/android\"
    android:shape=\"oval\">
    <stroke
        android:width=\"1.5dp\"
        android:color=\"#553B82F6\" />
    <size
        android:width=\"220dp\"
        android:height=\"220dp\" />
    <solid android:color=\"@android:color/transparent\" />
</shape>
""",
        encoding="utf-8",
    )

    (RES / "anim").mkdir(parents=True, exist_ok=True)
    (RES / "anim" / "splash_ring_rotate.xml").write_text(
        """<?xml version=\"1.0\" encoding=\"utf-8\"?>
<rotate xmlns:android=\"http://schemas.android.com/apk/res/android\"
    android:drawable=\"@drawable/splash_ring\"
    android:fromDegrees=\"0\"
    android:toDegrees=\"360\"
    android:pivotX=\"50%\"
    android:pivotY=\"50%\"
    android:duration=\"12000\"
    android:repeatCount=\"infinite\"
    android:interpolator=\"@android:anim/linear_interpolator\" />
""",
        encoding="utf-8",
    )

    print("Splash drawables written under", RES)


if __name__ == "__main__":
    main()
