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

`./build.sh` — builds the Swift app, copies the API key from `.env`, ad-hoc-codesigns. Output is ~1.5MB. Heavy dependencies (Python framework, deno, yt-dlp) are **not** bundled — they're downloaded on first launch, see below.

## Runtime — on-demand, lives outside the app bundle

`~/Library/Application Support/YouLearn/runtime/` holds everything heavy:
- `Python.framework/` — universal2 from python.org, ~80MB
- `bin/deno` — single-arch (matches `uname -m`) from github.com/denoland/deno releases, ~100MB
- `Python.framework/.../site-packages/yt_dlp` — pip-installed into the bundled Python's site-packages

This means the shipped app is tiny, and updating yt-dlp doesn't require an app release — bump it via Settings (slice B, not yet built) or rerun the install.

`Runtime.swift` owns paths, version constants, install steps, and an environment helper. `FirstRunWindowController` shows progress on first launch when `Runtime.isInstalled` is false. To force re-download: `rm -rf ~/Library/Application\ Support/YouLearn/runtime`.

When upgrading Python or deno, bump `pythonVersion` / `denoVersion` in `Runtime.swift` and (later, slice B) trigger a re-install for users on older versions.

## Why no install_name relocation

The Python.org pkg bakes `/Library/Frameworks/Python.framework/...` into the install_names of `python3.12` and every `.so` extension module. The textbook fix is `install_name_tool -change` + `-add_rpath` + re-codesign, but on macOS 15 that consistently produces `SIGKILL (Code Signature Invalid)` at launch — `install_name_tool`'s edits no longer survive an immediate ad-hoc re-sign in a way the kernel's codesigning monitor accepts.

So we **don't touch the binaries**. `Runtime.processEnvironment()` sets:
- `DYLD_FRAMEWORK_PATH` = the runtime directory — dyld searches it before the absolute path baked into `python3`'s `LC_LOAD_DYLIB`.
- `DYLD_LIBRARY_PATH` = `Python.framework/Versions/3.12/lib` — same trick, for `.so` modules that load `libssl.3.dylib`, `libcrypto.3.dylib`, etc. by absolute path.

When upgrading Python, no per-version patching is needed.

## Resolution / HD playback

We download at 360p combined (itag 18). HD requires merging separate adaptive video + audio streams; every Swift-side approach we tried (`AVAssetExportSession` passthrough, `AVAssetWriter` sample copy) failed on the target hardware (2017 MBA without H.264 hardware encode, which rules out re-encode fallbacks). See `docs/hd-experiment.md` for the full timeline, hypotheses, and the most promising path to revisit (bundling ffmpeg in the on-demand runtime).

## Hardened runtime / signed builds

When `SIGN=1`, the YouLearn binary gets `--options runtime`. To allow loading the runtime Python's `.so` extension modules from `~/Library/Application Support/...` (outside the app bundle, not signed by us), the entitlements file will need `com.apple.security.cs.disable-library-validation` and `com.apple.security.cs.allow-dyld-environment-variables`. Add these before shipping a Developer-ID-signed build.

## Bundled Python — why no install_name relocation

The Python.org pkg bakes `/Library/Frameworks/Python.framework/...` into the install_names of `python3.12` and every `.so` extension module. The textbook fix is `install_name_tool -change` + `-add_rpath` + re-codesign, but on macOS 15 that consistently produces `SIGKILL (Code Signature Invalid)` at launch — `install_name_tool`'s edits no longer survive an immediate ad-hoc re-sign in a way the kernel's codesigning monitor accepts. (Reproducible: rewrite all `/Library/Frameworks/Python.framework` refs to `@rpath`, `add_rpath @executable_path/../`, `codesign --force --deep -s -`, run `python3 -c 'print(1)'` → exit 137, crash report shows `codeSigningTrustLevel: -1`.)

So we **don't touch the binaries**. Every invocation sets:
- `DYLD_FRAMEWORK_PATH` = the `Contents/Frameworks/` directory (where `Python.framework` lives) — dyld searches it before the absolute path baked into `python3`'s `LC_LOAD_DYLIB`.
- `DYLD_LIBRARY_PATH` = `Python.framework/Versions/3.12/lib` — same trick, for the `.so` modules that load `libssl.3.dylib`, `libcrypto.3.dylib`, etc. by absolute path.

Both are set by `build.sh` (during `pip install`) and by `YTDLP.pythonEnvironment` (every runtime invocation). When upgrading Python, bump `PYTHON_VERSION` in `build.sh`, delete `vendor/Python.framework`, and rebuild — the same DYLD trick works without any per-version patching.

## JS runtime (bundled deno)

yt-dlp solves YouTube's n-param JS challenges by shelling out to `deno`. We bundle a universal2 `deno` at `Contents/Resources/bin/deno` and `YTDLP.pythonEnvironment` puts that directory at the front of `PATH` (and explicitly *omits* `/opt/homebrew/bin` and `/usr/local/bin` so we never accidentally use a system one). To upgrade, bump `DENO_VERSION` in `build.sh`, delete `vendor/deno`, and rebuild. Verified end-to-end: with PATH locked to only the bundle, yt-dlp logs `[jsc:deno] Solving JS challenges using deno` and downloads at full speed.

## Logo / icon

Source SVG: `logos/export/logo.svg`. To regenerate `Resources/AppIcon.icns`, render the iconset PNGs with `rsvg-convert` at the standard sizes (16, 32, 64, 128, 256, 512, 1024 — including @2x variants), then `iconutil -c icns Resources/AppIcon.iconset -o Resources/AppIcon.icns`. `librsvg` via `brew install librsvg`.
