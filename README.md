# YouLearn

A small native macOS app for watching YouTube playlists as study material — with per-video resume, a local cache, and a password gate to keep the dock icon honest.

<p align="center">
  <img src="logos/export/logo-512.png" width="180" alt="YouLearn icon">
</p>

## Features

- Sidebar of playlists and standalone videos, fetched via `yt-dlp`
- Per-video resume (picks up where you left off, per playlist or per video)
- Local video cache, or stream-on-demand mode
- Settings window for managing playlists, single videos, cache, password, and streaming preference
- Password gate on launch and on entering Settings

## Download

Grab the latest `.app` from the [Releases page](https://github.com/finereli/youlearn/releases/latest).

Releases are signed with a Developer ID but not notarized, so Gatekeeper will warn on first launch. Right-click → Open the first time, or run once:

```sh
xattr -dr com.apple.quarantine /Applications/YouLearn.app
```

## Requirements

**To run:**

- macOS 11+ (universal binary, runs on Intel and Apple Silicon)
- Python 3.9+ available as `python3` in `/usr/local/bin`, `/opt/homebrew/bin`, or on `PATH` (yt-dlp is bundled as a Python zipapp)

**To build:**

- Swift toolchain (`swift --version`)
- `librsvg` (only for regenerating the app icon — `brew install librsvg`)

## Build & run

```sh
./build.sh                # unsigned ad-hoc build (fast, runs on your own machine)
SIGN=1 ./build.sh         # signed with your Developer ID (for distribution)
NOTARIZE=1 ./build.sh     # signed + notarized + stapled (no Gatekeeper warning)
open YouLearn.app
```

`build.sh` downloads the yt-dlp Python zipapp into `vendor/` on first run, builds with SwiftPM in release mode as a universal binary, and assembles `YouLearn.app`. `SIGN=1` and `NOTARIZE=1` use the Developer ID configured at the top of the script and the `YOULEARN_NOTARY` keychain profile (set up via `xcrun notarytool store-credentials`).

## Project layout

```
Sources/YouLearn/   Swift sources (AppKit, no storyboards)
Resources/          Info.plist, AppIcon.icns
logos/              Logo SVGs and exported PNGs
vendor/             yt-dlp binary (gitignored)
build.sh            Build + bundle script
```

## License

MIT.
