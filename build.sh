#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# Fetch yt-dlp standalone binary into vendor/ if missing
mkdir -p vendor
if [ ! -x vendor/yt-dlp ]; then
    # Pin to the last release that still ships yt-dlp_macos_legacy (2025.08.11).
    # The current `latest` yt-dlp_macos requires macOS 12+, and _legacy was dropped
    # from later releases — so this is the newest version that still runs on Big Sur.
    echo "Downloading yt-dlp_macos_legacy (2025.08.11)…"
    curl -L --fail -o vendor/yt-dlp \
        https://github.com/yt-dlp/yt-dlp/releases/download/2025.08.11/yt-dlp_macos_legacy
    chmod +x vendor/yt-dlp
fi

swift build -c release --arch arm64 --arch x86_64

BIN=$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)
APP="YouLearn.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

cp "$BIN/YouLearn" "$APP/Contents/MacOS/YouLearn"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp vendor/yt-dlp "$APP/Contents/Resources/yt-dlp"
chmod +x "$APP/Contents/Resources/yt-dlp"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

codesign --force --deep --sign - "$APP" 2>/dev/null || true

echo "Built $APP ($(du -sh "$APP" | cut -f1))"
echo "Run: open $APP"
