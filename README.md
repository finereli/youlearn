# YouLearn

A small native macOS app for watching YouTube playlists as study material — with per-video resume, a chrome-free embedded player, and a password gate to keep the dock icon honest.

<p align="center">
  <img src="logos/export/logo-512.png" width="180" alt="YouLearn icon">
</p>

## Features

- Sidebar of playlists and standalone videos, fetched via the YouTube Data API
- Embedded YouTube player (`WKWebView`) with masthead, comments, recommendations, and end-screens hidden
- Per-video resume + auto-advance to the next video in a playlist
- Password gate on launch and on entering Settings

## Download

Grab the latest `.app` from the [Releases page](https://github.com/finereli/youlearn/releases/latest).

Releases are signed with a Developer ID but not notarized, so Gatekeeper will warn on first launch. Right-click → Open the first time, or run once:

```sh
xattr -dr com.apple.quarantine /Applications/YouLearn.app
```

## Requirements

**To run:** macOS 11+ (universal binary, runs on Intel and Apple Silicon).

**To build:**

- Swift toolchain (`swift --version`)
- A `YOUTUBE_API_KEY` in `.env` (Data API v3 key from Google Cloud)
- `librsvg` (only for regenerating the app icon — `brew install librsvg`)

## Build & run

```sh
./build.sh                # unsigned ad-hoc build (fast, runs on your own machine)
SIGN=1 ./build.sh         # signed with your Developer ID (for distribution)
NOTARIZE=1 ./build.sh     # signed + notarized + stapled (no Gatekeeper warning)
open YouLearn.app
```

`build.sh` builds with SwiftPM as a universal binary, copies the API key from `.env` into the bundle, and ad-hoc-codesigns. The whole app is the binary plus a few resource files (no bundled Python, ffmpeg, or yt-dlp). `SIGN=1` and `NOTARIZE=1` use the Developer ID configured at the top of the script and the `YOULEARN_NOTARY` keychain profile (set up via `xcrun notarytool store-credentials`).

## Project layout

```
Sources/YouLearn/   Swift sources (AppKit, no storyboards)
Resources/          Info.plist, AppIcon.icns, entitlements
logos/              Logo SVGs and exported PNGs
build.sh            Build + bundle script
```

## License

MIT.
