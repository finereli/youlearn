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

## Requirements

- macOS 11+
- Swift toolchain (`swift --version`)
- `librsvg` (only for regenerating the app icon — `brew install librsvg`)

## Build & run

```sh
./build.sh
open YouLearn.app
```

`build.sh` downloads `yt-dlp_macos` into `vendor/` on first run, builds with SwiftPM in release mode, assembles `YouLearn.app`, and ad-hoc-codesigns it.

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
