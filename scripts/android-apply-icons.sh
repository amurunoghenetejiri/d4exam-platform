#!/usr/bin/env bash
# Generate D4EXAM launcher icons into an existing android/ tree.
set -euo pipefail

DRAW="android/app/src/main/res/drawable"
mkdir -p "$DRAW"

ICON_SRC=""
for candidate in public/icon-512.png public/logo.png public/apple-touch-icon.png public/favicon.png; do
  if [ -f "$candidate" ]; then
    ICON_SRC="$candidate"
    break
  fi
done

if [ -z "$ICON_SRC" ]; then
  echo "WARN: no brand icon in public/; keeping Cap default"
  exit 0
fi

echo "Using icon source: $ICON_SRC"
sudo apt-get update -qq
sudo apt-get install -y -qq imagemagick

for pair in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  dens="${pair%%:*}"
  px="${pair##*:}"
  dir="android/app/src/main/res/mipmap-${dens}"
  mkdir -p "$dir"
  convert "$ICON_SRC" -resize "${px}x${px}" -background none -gravity center -extent "${px}x${px}" "$dir/ic_launcher.png"
  convert "$ICON_SRC" -resize "${px}x${px}" -background none -gravity center -extent "${px}x${px}" "$dir/ic_launcher_round.png"
  fg=$(( px * 72 / 100 ))
  convert "$ICON_SRC" -resize "${fg}x${fg}" -background none -gravity center -extent "${px}x${px}" "$dir/ic_launcher_foreground.png"
done

ANY="android/app/src/main/res/mipmap-anydpi-v26"
mkdir -p "$ANY"
cat > "$ANY/ic_launcher.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/splash_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
EOF
cp "$ANY/ic_launcher.xml" "$ANY/ic_launcher_round.xml"

convert "$ICON_SRC" -resize 48x48 -colorspace Gray "$DRAW/ic_stat_d4exam.png" || true
echo "OK: D4EXAM launcher icons written"
ls -la android/app/src/main/res/mipmap-xxxhdpi/ || true
