# YouLearn — notes for Claude

## What this app is

A small macOS app that plays YouTube videos in a kid-friendly, chrome-free
shell. Sidebar of playlists/videos on the left, an embedded YouTube player on
the right. The "player" is a `WKWebView` pointed at `https://www.youtube.com/watch?v=…`
with CSS that hides everything except the player itself, plus a tiny JS bridge
for resume tracking and playlist advance. See `BrowserPlayerViewController.swift`.

Library metadata (titles, durations, thumbnails) comes from the official
YouTube Data API v3 — see `YouTubeAPI.swift`. Requires `YOUTUBE_API_KEY` in
`.env`, which `build.sh` copies into `Resources/youtube-api-key.txt`.

There is **no** local download, no yt-dlp, no Python, no ffmpeg. Earlier
versions had all of that; v0.3.0 stripped it after we discovered the embedded
browser just works.

## Versioning & releases

The app version lives in **`Resources/Info.plist`** (`CFBundleShortVersionString`). When cutting a new release, bump it and tag to match.

When the user asks to publish a build / cut a release:

1. Bump `CFBundleShortVersionString` in `Resources/Info.plist` (and `CFBundleVersion` if it's a meaningful build). Use semver: patch for fixes, minor for features, major for breaking changes.
2. Commit the bump: `chore: bump version to vX.Y.Z`.
3. Build: `./build.sh`.
4. Zip the bundle: `ditto -c -k --keepParent YouLearn.app YouLearn-vX.Y.Z.zip`.
5. Tag and push: `git tag vX.Y.Z && git push origin main --tags`.
6. Create the GitHub release with the zip attached:
   ```sh
   gh release create vX.Y.Z YouLearn-vX.Y.Z.zip --title "vX.Y.Z" --notes "..."
   ```

The README links to `releases/latest`, so it does not need editing on each release.

## Build

`./build.sh` — builds the Swift app, copies the API key from `.env`, ad-hoc-codesigns. Output is ~1.5MB. No bundled dependencies; the entire runtime is the app binary plus a few Resources files.

## CSS-hiding YouTube chrome

`BrowserPlayerViewController.swift` injects a stylesheet at `documentStart` that hides the masthead, right rail, comments, end-screens, autoplay overlay, and the entire below-player section (`#below`, `ytd-watch-metadata`, etc.). When YouTube renames a class these go stale; refresh from DevTools.

The JS bridge listens for the `<video>` element to actually have frame data before posting `playing` to native — that's what dismisses the dark loading overlay. Resume position is persisted on a 5-second tick; `ended` triggers playlist advance.

## Hardened runtime / signed builds

When `SIGN=1`, the YouLearn binary gets `--options runtime`. The app loads no external dylibs of its own, so the entitlements file does not need `disable-library-validation`.

## Logo / icon

Source SVG: `logos/export/logo.svg`. To regenerate `Resources/AppIcon.icns`, render the iconset PNGs with `rsvg-convert` at the standard sizes (16, 32, 64, 128, 256, 512, 1024 — including @2x variants), then `iconutil -c icns Resources/AppIcon.iconset -o Resources/AppIcon.icns`. `librsvg` via `brew install librsvg`.
