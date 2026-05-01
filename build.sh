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
DENO_VERSION="${DENO_VERSION:-v2.7.14}"
if [ ! -x "vendor/deno" ]; then
    echo "Downloading deno $DENO_VERSION (universal2 lipo)…"
    rm -rf vendor/deno_tmp
    mkdir -p vendor/deno_tmp
    curl -L --fail -o vendor/deno_tmp/arm64.zip \
        "https://github.com/denoland/deno/releases/download/$DENO_VERSION/deno-aarch64-apple-darwin.zip"
    curl -L --fail -o vendor/deno_tmp/x86_64.zip \
        "https://github.com/denoland/deno/releases/download/$DENO_VERSION/deno-x86_64-apple-darwin.zip"
    unzip -q vendor/deno_tmp/arm64.zip -d vendor/deno_tmp/arm64
    unzip -q vendor/deno_tmp/x86_64.zip -d vendor/deno_tmp/x86_64
    lipo -create \
        vendor/deno_tmp/arm64/deno \
        vendor/deno_tmp/x86_64/deno \
        -output vendor/deno
    chmod +x vendor/deno
    rm -rf vendor/deno_tmp
    # Ad-hoc sign so macOS will execute it
    codesign --force -s - vendor/deno
fi

PYTHON_VERSION="${PYTHON_VERSION:-3.12.7}"
if [ ! -d "vendor/Python.framework" ]; then
    mkdir -p vendor
    echo "Downloading Python $PYTHON_VERSION (universal2)…"
    curl -L --fail -o vendor/python.pkg \
        "https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-macos11.pkg"
    rm -rf vendor/python_pkg
    pkgutil --expand-full vendor/python.pkg vendor/python_pkg
    cp -R vendor/python_pkg/Python_Framework.pkg/Payload vendor/Python.framework
    rm -rf vendor/python_pkg vendor/python.pkg

    echo "Installing yt-dlp into bundled Python…"
    PY="vendor/Python.framework/Versions/3.12/bin/python3"
    DYLD_FRAMEWORK_PATH="$PWD/vendor" \
    DYLD_LIBRARY_PATH="$PWD/vendor/Python.framework/Versions/3.12/lib" \
        "$PY" -m ensurepip --upgrade > /dev/null
    DYLD_FRAMEWORK_PATH="$PWD/vendor" \
    DYLD_LIBRARY_PATH="$PWD/vendor/Python.framework/Versions/3.12/lib" \
        "$PY" -m pip install --upgrade --quiet --disable-pip-version-check pip yt-dlp certifi
fi

swift build -c release --arch arm64 --arch x86_64

BIN=$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)
APP="YouLearn.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

cp "$BIN/YouLearn" "$APP/Contents/MacOS/YouLearn"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

mkdir -p "$APP/Contents/Frameworks"
ditto vendor/Python.framework "$APP/Contents/Frameworks/Python.framework"

mkdir -p "$APP/Contents/Resources/bin"
cp vendor/deno "$APP/Contents/Resources/bin/deno"
chmod +x "$APP/Contents/Resources/bin/deno"

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
