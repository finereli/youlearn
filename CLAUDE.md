# YouLearn — notes for Claude

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

`./build.sh` — downloads `yt-dlp_macos` into `vendor/` if missing, builds release with SwiftPM, assembles `YouLearn.app`, ad-hoc-codesigns. No notarization.

## Logo / icon

Source SVG: `logos/export/logo.svg`. To regenerate `Resources/AppIcon.icns`, render the iconset PNGs with `rsvg-convert` at the standard sizes (16, 32, 64, 128, 256, 512, 1024 — including @2x variants), then `iconutil -c icns Resources/AppIcon.iconset -o Resources/AppIcon.icns`. `librsvg` via `brew install librsvg`.
