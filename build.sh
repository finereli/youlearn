#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# Fetch yt-dlp standalone binary into vendor/ if missing
mkdir -p vendor
if [ ! -x vendor/yt-dlp ]; then
    # Bundle the Python zipapp (shebang'd, runs on any system with python3 ≥ 3.9).
    # This avoids the macOS-12+ requirement of the prebuilt yt-dlp_macos binary
    # while still getting every upstream update.
    echo "Downloading yt-dlp (Python zipapp)…"
    curl -L --fail -o vendor/yt-dlp \
        https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
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
