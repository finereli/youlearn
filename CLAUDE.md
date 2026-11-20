# YouLearn: notes for Claude

## What this app is

A PWA that lets a kid watch chosen YouTube shows without the rest of
YouTube: no recommendations, no next-video pull, no way out to youtube.com.
It started as a native Mac app (WKWebView with CSS hiding youtube.com's
chrome, tag v0.3.1 in git history) and was replaced by this PWA in
Nov 2026 so it runs on any device, mainly Yara's iPad.

Live at https://youlearn.finereli.com. Svelte 5 + Vite from the pwa skill's
kit (`shared/` holds the kit files, with `pwa-kit` headers), deployed as a
static Cloudflare Worker.

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
```

Eli deploys straight to main. Icons: `scripts/make-icons.sh` renders
`logos/export/logo.svg` into `public/icons/`.

See ROADMAP.md for what's next.
