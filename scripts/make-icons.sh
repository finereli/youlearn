#!/usr/bin/env bash
# PWA icons from the app's logo (logos/export/logo.svg). Icons are opaque
# full-bleed squares: the platform rounds them. The mark sits at ~86% in the
# "any" icons and ~76% in the maskable one (launchers crop to a circle).
set -euo pipefail
cd "$(dirname "$0")/.."
src=logos/export/logo.svg
out=public/icons
mkdir -p "$out"
tmp=$(mktemp -d)
# The logo's own rounded background, dropped: we draw a full square instead.
mark=$(sed -e '/<g id="background">/,/<\/g>/d' -e '1d' -e '$d' "$src")
icon() { # scale size file
  local s=$1 size=$2 file=$3 off
  off=$(python3 -c "print(256*(1-$s))")
  cat > "$tmp/i.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#1F6F6A"/>
<g transform="translate($off $off) scale($s)">$mark</g>
</svg>
SVG
  rsvg-convert -w "$size" -h "$size" "$tmp/i.svg" -o "$out/$file"
}
icon 1.0 192 icon-192.png
icon 1.0 512 icon-512.png
icon 1.0 180 apple-touch-icon.png
icon 0.84 512 icon-maskable-512.png
rm -r "$tmp"
ls -la "$out"
