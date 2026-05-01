#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# SIGN=1   → sign with Developer ID (Gatekeeper still prompts; no notarization).
# NOTARIZE=1 → sign + submit to Apple notary + staple. Implies SIGN=1.
# Default is an unsigned ad-hoc build (fast iteration).
NOTARIZE="${NOTARIZE:-0}"
SIGN="${SIGN:-0}"
if [ "$NOTARIZE" = "1" ]; then SIGN=1; fi
DEVELOPER_ID="Developer ID Application: ELI FINER (A59G53TN44)"
NOTARY_PROFILE="YOULEARN_NOTARY"

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

if [ "$SIGN" = "1" ]; then
    echo "Signing with Developer ID (hardened runtime + timestamp)…"
    codesign --force --options runtime --timestamp \
        --entitlements Resources/YouLearn.entitlements \
        --sign "$DEVELOPER_ID" \
        "$APP/Contents/MacOS/YouLearn"
    codesign --force --options runtime --timestamp \
        --entitlements Resources/YouLearn.entitlements \
        --sign "$DEVELOPER_ID" \
        "$APP"

    echo "Verifying signature…"
    codesign --verify --strict --verbose=2 "$APP"
fi

if [ "$NOTARIZE" = "1" ]; then
    SUBMIT_ZIP="$(mktemp -d)/YouLearn-submit.zip"
    ditto -c -k --keepParent "$APP" "$SUBMIT_ZIP"

    echo "Submitting to Apple notary service (this can take a few minutes)…"
    xcrun notarytool submit "$SUBMIT_ZIP" \
        --keychain-profile "$NOTARY_PROFILE" \
        --wait

    echo "Stapling notarization ticket…"
    xcrun stapler staple "$APP"
    xcrun stapler validate "$APP"
    rm -f "$SUBMIT_ZIP"
fi

if [ "$SIGN" != "1" ]; then
    codesign --force --deep --sign - "$APP" 2>/dev/null || true
fi

echo "Built $APP ($(du -sh "$APP" | cut -f1))"
echo "Run: open $APP"
