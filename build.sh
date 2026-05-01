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

# Bundle Python.org's universal2 framework + yt-dlp into vendor/Python.framework.
# The framework's binaries hardcode /Library/Frameworks/Python.framework as load
# paths. Rather than rewriting them with install_name_tool (which trips macOS
# 15's stricter codesign verification and crashes the binary at launch), we
# leave the framework untouched and set DYLD_FRAMEWORK_PATH + DYLD_LIBRARY_PATH
# at runtime when invoking python — see YTDLP.swift.
swift build -c release --arch arm64 --arch x86_64

BIN=$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)
APP="YouLearn.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

cp "$BIN/YouLearn" "$APP/Contents/MacOS/YouLearn"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"


# Bundle YouTube Data API key from .env (gitignored). Required for metadata
# fetches; without it, adding playlists/videos will fail at runtime with a
# clear error pointing at .env.
if [ -f .env ]; then
    KEY=$(grep -E '^YOUTUBE_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r\n')
    if [ -n "$KEY" ]; then
        printf '%s' "$KEY" > "$APP/Contents/Resources/youtube-api-key.txt"
    fi
fi

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
