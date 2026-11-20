# YouLearn: notes for Claude

## What this app is

A PWA that lets a kid watch chosen YouTube shows without the rest of
YouTube: no recommendations, no next-video pull, no way out to youtube.com.
It started as a native Mac app (WKWebView with CSS hiding youtube.com's
chrome, tag v0.3.1 in git history) and was replaced by this PWA in
Nov 2026 so it runs on any device, mainly Yara's iPad.

Live at https://youlearn.finereli.com. Svelte 5 + Vite from the pwa skill's
kit (`shared/` holds the kit files, with `pwa-kit` headers), deployed as a
Cloudflare Worker: static assets plus `/api` and `/ws` for the parent's
remote control (`worker/`).

## How the player keeps YouTube out

A web page can't restyle youtube.com, so the player uses YouTube's IFrame API
(youtube-nocookie, `controls=0`) and covers it:

- a transparent shield over the frame takes every tap; our own controls sit on it
- an opaque poster hides the frame whenever it isn't playing (YouTube's pause overlay)
- playback stops 1.5s before the end, so YouTube's end screen never appears;
  our end card offers the next episode of the same show
- if a tap doesn't start playback within 2.5s (Safari can insist on a tap
  inside the frame), the shield opens a hole in the middle and asks for one
  tap on the video. On Eli's iPad our own play button worked.

Details in the comment at the top of `src/components/Player.svelte`.
Fullscreen is element fullscreen with the WebKit prefix (`src/lib/fullscreen.ts`);
iPhone has none for this, so the button hides there.

## Watch time and the parent's console

The child's device never signs in to anything. On the parent's phone,
`#/parent` signs in with finereli login (`PARENT_EMAILS` secret lists who may),
and "Add a device" shows a six-digit code that works once for ten minutes.
The device trades it for its own random token (`POST /api/pair`), which only
means "this device belongs to this child". Removing the device in the console
sends it back to the pairing screen.

The timer is a deadline on the server's clock. One Durable Object per family
(`worker/family.ts`) holds each child's `until` and what she's watching; the
console and every device hold a hibernating WebSocket to it
(`src/lib/remote.svelte.ts`). It fails closed: locked by default, and offline
the device counts down from the last deadline it heard (saved in
localStorage). At zero the player pauses and the locked screen covers
everything; the app stays open. Her countdown shows for the last five
minutes, which is also what "wrap up in 2/3/5 min" uses. "Let her finish this
episode" extends to the end of the episode plus 20s. Pairing codes live in a
singleton Durable Object (`worker/codes.ts`) that pauses pairing after 30 wrong
guesses in ten minutes.

Tests run against `wrangler dev` with a stand-in login service:
`node test/fake-login.mjs` (port 8790), `.dev.vars` with
`LOGIN_ISSUER="http://localhost:8790"` and `PARENT_EMAILS="parent@example.com"`,
then `npm run test:e2e` (two browsers; set PLAYWRIGHT to the global
playwright path) and `npm run test:timer` (socket level). Start wrangler with
a fresh `--persist-to` directory: the e2e test expects no children yet.

## The library

Baked into the bundle for now (`src/lib/library.json`), built by
`npm run library` (`scripts/build-shows.py`) from files in `content/`:

- `raw/<channel>.jsonl`: every upload of a channel, from
  `scripts/fetch-channel.py <@handle>` (scrapes the public page and follows
  its continuation, no API key)
- `wiki/<show>.wiki`: the show's Wikipedia episode list (wikitext), which
  gives each episode its season and order
- `season-*.json`: Wild Kratts, whose channel keeps season playlists
  (`scripts/fetch-playlist.py`)

Only single full episodes go in. A video counts when its length fits one
episode and its title matches a Wikipedia episode; compilations, "best of",
shorts and promos are filtered out, and each episode appears once. Each show
has its own rules in `build-shows.py` (Zoboomafoo uses the episode number in
its titles; Nature Cat comes from Scholastic's half-episodes plus PBS KIDS).
Check new episodes are embeddable with YouTube's oEmbed (401 means blocked).

Show art lives in `public/shows/<id>.jpg`, 1200x600, cropped from the
official channels' banners (Nature Cat from a PBS KIDS clip thumbnail).

Dino Dana isn't in: its official channel (Dino Kids) posts only promos,
minisodes and compilations; the full episodes on YouTube are pirated uploads.

## Build and deploy

```sh
npm run build                                   # svelte-check + vite build
secret-env cloudflare -- npx wrangler deploy    # to youlearn.finereli.com
# once: secret-env cloudflare -- npx wrangler secret put PARENT_EMAILS
```

Eli deploys straight to main. Icons: `scripts/make-icons.sh` renders
`logos/export/logo.svg` into `public/icons/`.

See ROADMAP.md for what's next.
