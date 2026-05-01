# HD playback experiment — findings

A log of what we tried in May 2026 to get >360p video playback in YouLearn, what failed, and why we settled on 360p combined for now. Read this before re-attempting HD; some of these dead ends look promising on paper.

## TL;DR

The current download path is itag 18 (360p combined mp4). It has no muxing step, so it can't fail in a way that strands the user. Higher resolutions are technically reachable but every path we tried had at least one disqualifying problem on the target hardware (a 2017 MacBook Air, macOS 11.7, no H.264 hardware encoder).

## What "HD" actually requires today

YouTube no longer offers itag 22 (720p combined H.264) for most modern uploads. Above 360p, video and audio are served as **separate adaptive streams** — typically `f136` (avc1, video-only mp4) + `f140` (mp4a AAC, audio-only m4a). Getting a single playable file means muxing the two without re-encoding. yt-dlp's standard answer is "shell out to ffmpeg." We tried to avoid that.

## Attempts, in chronological order

### 1. Pure-Swift InnerTube extractor (`swift-yt-dlp/`)

A ~140-line probe (see `swift-yt-dlp/FINDINGS.md`) that posed as the `ANDROID_VR` InnerTube client and got stream URLs directly. Worked end-to-end on a rickroll, downloaded a real 11MB MP4 with no JS interpreter, no ffmpeg, no Python. **Initially convincing.**

**Why we abandoned it:**
- Many videos returned `playabilityStatus: LOGIN_REQUIRED — Sign in to confirm you're not a bot`. Adding `visitorData` (extracted from a homepage fetch) cleared that gate for some videos.
- The format URLs from `streamingData.formats[]` came with an obfuscated `n` query parameter. Without descrambling it (which requires running YouTube's player JS), googlevideo.com **throttles to ~30 KB/s**. yt-dlp uses an external JS runtime (deno or node) to descramble; replicating this in Swift means embedding JavaScriptCore + maintaining yt-dlp's ever-rotating regex catalog of how to extract the descramble function from minified player JS.
- yt-dlp recently added a separate **EJS challenge solver** layer (`--remote-components ejs:github`) on top of the JS runtime. Another moving piece.
- Conclusion: the client-impersonation approach is a treadmill that breaks weekly. AI-driven diff-watching against `yt-dlp/extractor/youtube/_base.py` could in principle keep up, but the watcher pipeline doesn't exist yet — first failure happens before the safety net does.

### 2. yt-dlp + bundled Python.framework + bundled deno

The current architecture. Works reliably:
- Downloads python.org's universal2 framework + lipo'd deno on first launch into `~/Library/Application Support/YouLearn/runtime/`.
- yt-dlp resolves URLs, descrambles n-params via deno, downloads bytes.
- See `CLAUDE.md` "Runtime — on-demand" + "Why no install_name relocation" sections.

This handles **download**. The remaining question was: how to mux 720p adaptive streams.

### 3. AVAssetExportSession passthrough mux (the muxer that was deleted)

yt-dlp without ffmpeg downloads `f136.mp4` + `f140.m4a` and prints `WARNING: ... formats won't be merged` (exit 0). We picked up both files in Swift, built an `AVMutableComposition` with the source video + audio tracks, and exported with `AVAssetExportPresetPassthrough`.

**Worked locally on the rickroll** — verified end-to-end: status `.completed`, single 23MB mp4, video + audio tracks both present, plays cleanly.

**Failed on the user's actual playlist videos**, on the target 2017 MBA: `AVAssetExportSession` returned the generic localized message *"the operation could not be completed"* / *"operation stopped"*. The underlying NSError chain wasn't dug into — that's a starting point for next time.

Hypotheses (not verified):
- yt-dlp's adaptive output may be **fragmented MP4** (multiple `moof` boxes, no consolidated `moov`). `AVAssetExportSession` passthrough is famously picky about edit lists and fragment layout. AVPlayer reads them fine; export rejects them.
- The video track may carry parameter-set extradata (SPS/PPS) only in the moof boxes, not in a stable `avcC` atom that the export session can find at session-init time.
- Some specific yt-dlp output mode (HLS vs. DASH segments concatenated) produces a file whose timing/metadata is just-different-enough.

### 4. AVAssetWriter manual sample-buffer copy (also deleted)

When the export session failed, fall back to reading source samples via `AVAssetReaderTrackOutput(outputSettings: nil)` and writing them via `AVAssetWriterInput(outputSettings: nil, sourceFormatHint: ...)` — copying compressed samples without re-encode.

**Audio worked. Video showed the QuickTime "missing codec" Q glyph in AVPlayer.** The output file had a video track but it wasn't decodable. Suspect causes: incomplete format description (parameter sets missing or in the wrong place), DTS/PTS mismatch, or sample tables that don't match the sample data. Diagnosed only at the symptom level.

### 5. Re-encode fallback via AVAssetExportPresetHighestQuality

**Hardware ruled this out.** The target machine is a 2017 MBA with no H.264 hardware encoder. Software re-encode of a 10-minute 720p clip would take many minutes and pin the CPU.

## What we settled on (May 2026)

itag 18 (360p combined mp4) — `-f "18/best[ext=mp4][acodec!=none]/best"`. yt-dlp + bundled Python + bundled deno produces a single-file mp4 in one step. No muxing, no AVFoundation post-processing, no failure modes beyond the underlying yt-dlp / network ones we already handle.

## Paths to revisit

Ranked by my hunch about success likelihood vs. effort.

### A. Bundle ffmpeg in the runtime (most promising)

Same on-demand pattern as deno. ~30–50MB compressed from `evermeet.cx` or yt-dlp/FFmpeg-Builds. With ffmpeg on PATH, yt-dlp does its standard `+`-format merge natively — no AV quirks, no muxing code in our Swift. This was the original plan in commit `0af8da8` (reverted as `c7fd133` for unrelated reasons). Worth retrying on the new on-demand-runtime architecture: the size penalty is now an extra ~30MB of one-time download, not bundle weight.

### B. Investigate the actual `AVAssetExportSession` error

Run the path again on a known-failing video, dig into `session.error.userInfo[NSUnderlyingErrorKey]` recursively. The generic top-level message hides whatever specific box / track / extradata problem AVFoundation is unhappy about. That diagnosis would tell us if there's a small pre-processing step (e.g. patching the moov box, rewriting edit lists) that makes the input acceptable. Without that we're guessing.

### C. Read yt-dlp's output for the failing video and figure out the file format

`mp4dump` / `MP4Box -info` on the `f136.mp4` file would say whether it's regular or fragmented MP4, what edit lists are present, etc. We never ran this. If it's regular mp4 with avc1 H.264, the export session shouldn't refuse it — that'd narrow the bug.

### D. Manual remux without AVFoundation: write our own MP4 muxer

A pure-Swift fragmented-MP4 → flat-MP4 remuxer is ~500 lines (ISO/IEC 14496-12 box rewrite, no codec work). Aviatrix-territory and a maintenance liability, but fully under our control. Last resort.

## Things to keep in mind

- **2017 MBA = no H.264 hardware encoder.** Re-encoding paths are unusable on the target. Anything that ships HD must be passthrough/remux only.
- **macOS 11.7** is the floor. `Python.framework` from python.org targets 10.9+, so it works. AVFoundation features added in macOS 13+ (e.g. async track loading) aren't available; we use the deprecated synchronous APIs intentionally.
- **The runtime download is one-shot.** First-launch UX adds Python (~80MB), deno (~100MB), yt-dlp via pip. If we add ffmpeg, that's another ~50MB. Still cheap vs. shipping it bundled in every release.
- **yt-dlp's `--keep-fragments` / `--remux-video` won't help** without ffmpeg — both rely on it.
- **Don't believe a passing rickroll test.** The Hellenism / Jewish History playlist videos behaved differently from the rickroll on the same code path. Always test against the actual content the user watches.
