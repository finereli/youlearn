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

One address for everyone. A device that isn't set up shows the welcome
screen (`Welcome.svelte`, the kit's Login gate): a parent signs in with
finereli login and lands in the console, or a child's device types a code.
The console (`ParentApp.svelte`) is the kit shell: TopBar, Drawer with
AccountMenu, SettingsPage pages for the child's remote, Devices and Parents
(`src/components/parent/`). The child's device never signs in to anything:
Devices → "Get a code" shows a six-digit code that works once for ten minutes.
The device trades it for its own random token (`POST /api/pair`), which only
means "this device belongs to this child". Removing the device in the console
sends it back to the welcome screen.

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

Families: each has an owner and other parents, kept by email in a singleton
Durable Object (`worker/directory.ts`); an email is in at most one family.
The owner adds and removes parents in the console, and a removed parent's
console closes at once. Anyone signed in can start a family while `SIGNUPS`
is "open", up to `SIGNUP_LIMIT` new families (wrangler.jsonc, 100 since Nov
20 2026; the Directory counts them, the seed doesn't count). Past the limit
they see "YouLearn is full for now". A new family's remote shows a getting-
started checklist (`FirstRun.svelte`: child, device, time, other parents) and
an invited parent gets a one-time welcome saying whose family they joined. The first family came from the `SEED_FAMILY` secret
(`{"owner": email, "parents": [emails]}`), read once when the directory was
empty: Eli owns it, Yael and Tom are parents. A family has any number of
children; the console's picker (`ChildPicker.svelte`, choice kept in
`yl:child`) chooses whose watch time, library and devices it shows, and
Devices renames or removes a child (their devices and library go too).

Tests run against `wrangler dev` with a stand-in login service:
`node test/fake-login.mjs` (port 8790), `.dev.vars` with
`LOGIN_ISSUER="http://localhost:8790"` and
`SEED_FAMILY={"owner":"parent@example.com","parents":["second@example.com"]}`,
wrangler with `--var SIGNUPS:closed` (the e2e test checks invite-only), then
`npm run test:e2e` (two browsers; set PLAYWRIGHT to the global
playwright path) and `npm run test:timer` (socket level). Start wrangler with
a fresh `--persist-to` directory (and `npx wrangler d1 migrations apply
youlearn --local --persist-to <dir>`): the e2e test expects no children yet.
Then `node test/library-ui.mjs` on the same server: console to iPad, live.
Playwright: `PLAYWRIGHT=<path to playwright-core>` and
`CHROMIUM=/usr/lib/chromium/chromium`.

MCP: run `node test/dev-login.mjs tester@example.com sub-1` (port 8788; it
prints a parent login token) with `LOGIN_ISSUER="http://localhost:8788"` and
`tester@example.com` as SEED_FAMILY's owner, then
`node test/mcp-flow-test.mjs` (the OAuth flow; its last line is an access
token) and `node test/library.mjs http://localhost:8787 <access> <login>`.

## The library

Each child has their own library, kept in the family's Durable Object
(`worker/family.ts`, storage key `library:<child id>`; the older family-wide
`library` key belongs to the first child) and sent over the family socket to
the consoles and that child's devices on connect and after every change. Devices keep the last one in
localStorage (`yl:library`) for offline launches; before the first one
arrives, the catalog stands in. Types and helpers shared by both sides are in
`worker/library.ts`.

A library is an ordered list of shows plus "More videos" (single videos, shown
as one more card on her home page). A show is either a catalog id, resolved on
read so catalog fixes reach every family, or the family's own copy. A child
whose library was never touched gets the whole catalog. Every video added goes
through `check()`: YouTube's oEmbed must say it exists and can be embedded
(401 means blocked), 40 per Durable Object call to stay under the free plan's
50 outbound requests, with good answers cached per family.

Parents change it two ways:

- the console's Library page (`src/components/parent/Library.svelte`): remove
  a show, add a catalog show, paste a link for "More videos" (`POST /api/library`
  with the child's id)
- their own AI agent over MCP (`worker/mcp.ts`); every tool takes the child's
  name (optional with one child). Building a whole show takes an agent that
  can run code (Claude Code, Codex) to list a channel's uploads: we decided
  against YouTube tools on the server, so agents in a browser only add catalog
  shows and single videos. The server checks every video. The rules for
  agents live in the `guide` tool. OAuth is the pwa kit's `mcp` item
  (`shared/functions/`), with tokens in D1 (`migrations/`); an agent acts as
  the parent's email and stops working when they leave the family. The
  console's Agents page lists and disconnects them.

### The catalog

The shows we built by hand, `worker/catalog.json`, built by `npm run library`
(`scripts/build-shows.py`) from files in `content/`:

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

Show art lives in `public/shows/<id>.jpg`, 1200x600, cropped from the
official channels' banners (Nature Cat from a PBS KIDS clip thumbnail).

Dino Dana isn't in: its official channel (Dino Kids) posts only promos,
minisodes and compilations; the full episodes on YouTube are pirated uploads.

## Build and deploy

```sh
npm run build                                   # svelte-check, tsc on worker/, vite build
secret-env cloudflare -- npx wrangler d1 migrations apply youlearn --remote   # after adding a migration
secret-env cloudflare -- npx wrangler deploy    # to youlearn.finereli.com
```

Eli deploys straight to main. Icons: `scripts/make-icons.sh` renders
`logos/export/logo.svg` into `public/icons/`.

See ROADMAP.md for what's next.
